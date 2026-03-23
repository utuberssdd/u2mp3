import { Router, type IRouter } from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { GetVideoInfoQueryParams, DownloadMp3QueryParams } from "@workspace/api-zod";
import { infoSemaphore, downloadSemaphore } from "../lib/semaphore";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const YTDLP_INFO_TIMEOUT_MS = 30_000;
const YTDLP_DOWNLOAD_TIMEOUT_MS = 300_000;

const RAPIDAPI_KEY = process.env["RAPIDAPI_KEY"] ?? "";
const RAPIDAPI_HOST = "youtube-mp310.p.rapidapi.com";

/** Rotating proxies for yt-dlp fallback */
const PROXIES = [
  "http://fnatiwbl:ru36dakkg11s@31.59.20.176:6754",
  "http://fnatiwbl:ru36dakkg11s@23.95.150.145:6114",
  "http://fnatiwbl:ru36dakkg11s@198.23.239.134:6540",
  "http://fnatiwbl:ru36dakkg11s@45.38.107.97:6014",
  "http://fnatiwbl:ru36dakkg11s@107.172.163.27:6543",
  "http://fnatiwbl:ru36dakkg11s@198.105.121.200:6462",
  "http://fnatiwbl:ru36dakkg11s@64.137.96.74:6641",
  "http://fnatiwbl:ru36dakkg11s@216.10.27.159:6837",
  "http://fnatiwbl:ru36dakkg11s@142.111.67.146:5611",
  "http://fnatiwbl:ru36dakkg11s@191.96.254.138:6185",
];

function getProxy(): string {
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

const infoRateLimit = rateLimit({
  windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment before trying again." },
});

const downloadRateLimit = rateLimit({
  windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many download requests — please wait a moment." },
});

function isValidYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"].includes(u.hostname);
  } catch { return false; }
}

function extractVideoId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    return u.searchParams.get("v") ?? "";
  } catch { return ""; }
}

/** Fetch basic video info from YouTube's free oEmbed API (no auth, no bot detection) */
async function fetchOembedInfo(url: string) {
  const oembed = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!oembed.ok) throw new Error("oEmbed failed");
  const data = await oembed.json() as { title?: string; author_name?: string; thumbnail_url?: string };
  const videoId = extractVideoId(url);
  return {
    title: data.title ?? "Unknown",
    author: data.author_name ?? "Unknown",
    duration: 0,
    thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoId,
  };
}

/** GET /api/youtube/info */
router.get("/info", infoRateLimit, async (req, res) => {
  const parsed = GetVideoInfoQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }

  const { url } = parsed.data;
  if (!isValidYoutubeUrl(url)) { res.status(400).json({ error: "Invalid YouTube URL" }); return; }

  let release: (() => void) | null = null;
  try {
    release = await infoSemaphore.acquire(50, YTDLP_INFO_TIMEOUT_MS);
  } catch (err: any) {
    res.status(503).json({ error: err.message }); return;
  }

  try {
    // Primary: yt-dlp with proxy (gets full info including duration)
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json", "--no-playlist", "--no-warnings",
      "--extractor-args", "youtube:player_client=ios",
      "--proxy", getProxy(),
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
  } catch (ytdlpErr: any) {
    // Fallback: YouTube oEmbed API (free, no bot detection, no duration)
    req.log.warn({ ytdlpErr }, "yt-dlp info failed, falling back to oEmbed");
    try {
      const info = await fetchOembedInfo(url);
      res.json(info);
    } catch (oembedErr: any) {
      req.log.error({ oembedErr }, "oEmbed fallback also failed");
      res.status(400).json({ error: "Could not fetch video information. Please check the URL and try again." });
    }
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

  res.setHeader("X-Active-Downloads", String(downloadSemaphore.activeTasks));
  res.setHeader("X-Queued-Downloads", String(downloadSemaphore.queueLength));

  let release: (() => void) | null = null;
  try {
    release = await downloadSemaphore.acquire(30, YTDLP_DOWNLOAD_TIMEOUT_MS);
  } catch (err: any) {
    res.status(503).json({ error: err.message }); return;
  }

  const videoId = extractVideoId(url);
  const safeFilename = `u2mp3-${videoId || "audio"}.mp3`;

  // ── Path A: RapidAPI ──────────────────────────────────────────────────────
  try {
    const rapidRes = await fetch(
      `https://${RAPIDAPI_HOST}/download/mp3?url=${encodeURIComponent(url)}`,
      {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST },
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (rapidRes.ok) {
      const { downloadUrl } = (await rapidRes.json()) as { downloadUrl?: string };

      if (downloadUrl) {
        const audioRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(60_000) });

        if (audioRes.ok && audioRes.body) {
          const cdnDisposition = audioRes.headers.get("content-disposition");
          const contentLength = audioRes.headers.get("content-length");

          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Content-Disposition", cdnDisposition ?? `attachment; filename="${safeFilename}"`);
          res.setHeader("Cache-Control", "no-store");
          if (contentLength) res.setHeader("Content-Length", contentLength);

          const reader = audioRes.body.getReader();
          req.on("close", () => release?.());

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writable) break;
            res.write(value);
          }
          res.end();
          release?.();
          return;
        }

        req.log.warn({ status: audioRes.status }, "RapidAPI CDN returned non-200, falling back to yt-dlp");
      }
    } else {
      req.log.warn({ status: rapidRes.status }, "RapidAPI returned non-200, falling back to yt-dlp");
    }
  } catch (rapidErr: any) {
    req.log.warn({ rapidErr }, "RapidAPI failed, falling back to yt-dlp");
  }

  // ── Path B: yt-dlp with rotating proxy fallback (with retry) ────────────────
  // Note: frontend sets the filename from video.title, so we skip title fetch here
  // to avoid an extra yt-dlp call that can trigger bot detection.
  let ytdlp: ReturnType<typeof spawn> | null = null;

  const cleanup = () => {
    release?.();
    release = null;
    if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGTERM");
  };

  req.on("close", cleanup);

  // Try direct (no proxy) first — VPS IP is less suspicious than datacenter proxies.
  // Then fall back to 2 random proxies if direct fails.
  const shuffledProxies = [...PROXIES].sort(() => Math.random() - 0.5).slice(0, 2);
  const proxyAttempts: Array<string | null> = [null, ...shuffledProxies];

  let started = false;
  for (const proxy of proxyAttempts) {
    if (res.writableEnded) break;

    try {
      await new Promise<void>((resolve, reject) => {
        const ytdlpArgs = [
          "--no-playlist", "--no-warnings",
          "--extractor-args", "youtube:player_client=ios",
          ...(proxy ? ["--proxy", proxy] : []),
          "-f", "bestaudio[ext=m4a]/bestaudio/best",
          "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
          "--no-cache-dir", "-o", "-",
          url,
        ];
        req.log.info({ proxy: proxy ?? "direct" }, "yt-dlp attempt");
        ytdlp = spawn("yt-dlp", ytdlpArgs);

        ytdlp.stdout.on("data", (chunk: Buffer) => {
          if (!started) {
            // First data received — commit headers and start streaming
            if (!res.headersSent) {
              res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
              res.setHeader("Content-Type", "audio/mpeg");
              res.setHeader("Cache-Control", "no-store");
            }
            started = true;
          }
          res.write(chunk);
        });

        ytdlp.stderr.on("data", (data: Buffer) => {
          req.log.debug({ msg: data.toString().trim() }, "yt-dlp stderr");
        });

        ytdlp.on("error", (err) => {
          req.log.warn({ err, proxy }, "yt-dlp process error");
          reject(err);
        });

        ytdlp.on("close", (code) => {
          if (code !== 0 && !started) {
            req.log.warn({ code, proxy }, "yt-dlp exited non-zero without producing output");
            reject(new Error(`yt-dlp exit code ${code}`));
          } else {
            if (!res.writableEnded) res.end();
            resolve();
          }
        });

        const hardTimeout = setTimeout(() => {
          req.log.warn("Download hard timeout — killing yt-dlp");
          if (ytdlp && !ytdlp.killed) ytdlp.kill("SIGTERM");
          reject(new Error("timeout"));
        }, YTDLP_DOWNLOAD_TIMEOUT_MS);

        ytdlp.on("close", () => clearTimeout(hardTimeout));
      });

      // Success — exit the retry loop
      cleanup();
      return;
    } catch (err: any) {
      req.log.warn({ err, proxy }, "yt-dlp proxy attempt failed, trying next proxy");
      ytdlp = null;
      // If we already started streaming, don't retry
      if (started) break;
    }
  }

  if (!started) {
    req.log.error("All proxies failed for download");
    if (!res.headersSent) res.status(400).json({ error: "Could not download this video. Please try again." });
  }
  cleanup();
});

/** GET /api/youtube/status */
router.get("/status", (_req, res) => {
  res.json({
    activeDownloads: downloadSemaphore.activeTasks,
    queuedDownloads: downloadSemaphore.queueLength,
    activeInfoLookups: infoSemaphore.activeTasks,
  });
});

export default router;
