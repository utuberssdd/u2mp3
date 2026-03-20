import type { VercelRequest, VercelResponse } from "@vercel/node";
import express, { type Express } from "express";
import cors from "cors";
import { spawn, execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const app: Express = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isValidYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "youtu.be" ||
      u.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/youtube/info", async (req, res) => {
  const url = req.query.url as string;

  if (!url) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  if (!isValidYoutubeUrl(url)) {
    res.status(400).json({ error: "Invalid YouTube URL" });
    return;
  }

  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      url,
    ], { timeout: 30000 });

    const info = JSON.parse(stdout);

    res.json({
      title: info.title ?? "Unknown",
      author: info.uploader ?? info.channel ?? "Unknown",
      duration: info.duration ?? 0,
      thumbnail: info.thumbnail ?? "",
      videoId: info.id ?? "",
    });
  } catch (err: any) {
    const message = err?.stderr?.toString() || err?.message || "Failed to fetch video info";
    res.status(400).json({ error: message.split("\n")[0] });
  }
});

app.get("/api/youtube/download", async (req, res) => {
  const url = req.query.url as string;

  if (!url) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  if (!isValidYoutubeUrl(url)) {
    res.status(400).json({ error: "Invalid YouTube URL" });
    return;
  }

  try {
    const { stdout: metaOut } = await execFileAsync("yt-dlp", [
      "--print", "%(title)s",
      "--no-playlist",
      "--no-warnings",
      url,
    ], { timeout: 15000 });

    const title = (metaOut.trim() || "download").replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();

    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);
    res.setHeader("Content-Type", "audio/mpeg");

    const ytdlp = spawn("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", "-",
      url,
    ]);

    ytdlp.stdout.pipe(res);

    ytdlp.on("error", (err) => {
      console.error("yt-dlp process error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      }
    });

    req.on("close", () => {
      ytdlp.kill("SIGTERM");
    });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(400).json({ error: err.message ?? "Failed to download video" });
    }
  }
});

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
