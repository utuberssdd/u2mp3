import { Router, type IRouter } from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { GetVideoInfoQueryParams, DownloadMp3QueryParams } from "@workspace/api-zod";
import { infoSemaphore, downloadSemaphore } from "../lib/semaphore";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const YTDLP_INFO_TIMEOUT_MS = 30_000;
const YTDLP_DOWNLOAD_TIMEOUT_MS = 300_000; // 5 min max per download stream

/** Per-IP rate limits */
const infoRateLimit = rateLimit({
  windowMs: 60_000,       // 1 minute window
  max: 30,                // 30 info requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment before trying again." },
});

const downloadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,                // 10 downloads per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many download requests — please wait a moment." },
});

function isValidYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** GET /api/youtube/info */
router.get("/info", infoRateLimit, async (req, res) => {
  const parsed = GetVideoInfoQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }

  const { url } = parsed.data;
  if (!isValidYoutubeUrl(url)) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  // Acquire concurrency slot
  let release: (() => void) | null = null;
  try {
    release = await infoSemaphore.acquire(50, YTDLP_INFO_TIMEOUT_MS);
  } catch (err: any) {
    res.status(503).json({ error: err.message });
    return;
  }

  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ], { timeout: YTDLP_INFO_TIMEOUT_MS });

    const info = JSON.parse(stdout);
    res.json({
      title: info.title ?? "Unknown",
      author: info.uploader ?? info.channel ?? "Unknown",
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? "",
      videoId: info.id ?? "",
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get video info");
    const message = err?.stderr?.toString() || err?.message || "Failed to fetch video info";
    res.status(400).json({ error: message.split("\n")[0] });
  } finally {
    release?.();
  }
});

/** GET /api/youtube/download */
router.get("/download", downloadRateLimit, async (req, res) => {
  const parsed = DownloadMp3QueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }

  const { url } = parsed.data;
  if (!isValidYoutubeUrl(url)) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  // Tell the client how many downloads are active so the UI can show a queue message
  const active = downloadSemaphore.activeTasks;
  const queued = downloadSemaphore.queueLength;
  res.setHeader("X-Active-Downloads", String(active));
  res.setHeader("X-Queued-Downloads", String(queued));

  // Acquire concurrency slot — clients wait in queue instead of erroring
  let release: (() => void) | null = null;
  try {
    release = await downloadSemaphore.acquire(30, YTDLP_DOWNLOAD_TIMEOUT_MS);
  } catch (err: any) {
    res.status(503).json({ error: err.message });
    return;
  }

  let ytdlp: ReturnType<typeof spawn> | null = null;

  // Always release the slot when done (success, error, or client disconnect)
  const cleanup = () => {
    release?.();
    release = null;
    if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGTERM");
  };

  req.on("close", cleanup);

  try {
    // Get title for filename (fast, cached by yt-dlp)
    const { stdout: titleOut } = await execFileAsync("yt-dlp", [
      "--print", "%(title)s",
      "--no-playlist", "--no-warnings",
      url,
    ], { timeout: 15_000 });

    const title = (titleOut.trim() || "download").replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    ytdlp = spawn("yt-dlp", [
      "--no-playlist", "--no-warnings",
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--no-cache-dir",
      "-o", "-",
      url,
    ]);

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on("data", (data: Buffer) => {
      req.log.debug({ msg: data.toString().trim() }, "yt-dlp stderr");
    });

    ytdlp.on("error", (err) => {
      req.log.error({ err }, "yt-dlp process error");
      if (!res.headersSent) res.status(500).json({ error: "Download failed" });
      cleanup();
    });

    ytdlp.on("close", (code) => {
      if (code !== 0) req.log.warn({ code }, "yt-dlp exited with non-zero code");
      cleanup();
    });

    // Hard timeout: kill the process if it runs too long
    const hardTimeout = setTimeout(() => {
      req.log.warn("Download hard timeout — killing yt-dlp");
      cleanup();
    }, YTDLP_DOWNLOAD_TIMEOUT_MS);

    ytdlp.on("close", () => clearTimeout(hardTimeout));
  } catch (err: any) {
    req.log.error({ err }, "Failed to start download");
    if (!res.headersSent) res.status(400).json({ error: err.message ?? "Failed to download video" });
    cleanup();
  }
});

/** GET /api/youtube/status — server load info */
router.get("/status", (_req, res) => {
  res.json({
    activeDownloads: downloadSemaphore.activeTasks,
    queuedDownloads: downloadSemaphore.queueLength,
    activeInfoLookups: infoSemaphore.activeTasks,
  });
});

export default router;
