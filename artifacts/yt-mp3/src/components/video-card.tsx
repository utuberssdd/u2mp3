import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, PlayCircle, Clock, User, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { VideoInfo } from "@workspace/api-client-react/src/generated/api.schemas";
import { getDownloadUrl } from "@/hooks/use-youtube";

interface VideoCardProps {
  video: VideoInfo;
  url: string;
}

const PROCESSING_STEPS = [
  { label: "Connecting to YouTube...", icon: "🔗", duration: 1800 },
  { label: "Extracting audio stream...", icon: "🎵", duration: 2200 },
  { label: "Converting to MP3...", icon: "⚙️", duration: 2000 },
  { label: "Finalizing download...", icon: "📦", duration: 1500 },
];

export function VideoCard({ video, url }: VideoCardProps) {
  const downloadUrl = getDownloadUrl(url);
  const [dlState, setDlState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [dlError, setDlError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (dlState !== "loading") {
      setStepIndex(0);
      setProgress(0);
      return;
    }

    let elapsed = 0;
    const totalDuration = PROCESSING_STEPS.reduce((s, st) => s + st.duration, 0);
    let currentStep = 0;

    const interval = setInterval(() => {
      elapsed += 80;
      setProgress(Math.min((elapsed / totalDuration) * 100, 95));

      let acc = 0;
      for (let i = 0; i < PROCESSING_STEPS.length; i++) {
        acc += PROCESSING_STEPS[i].duration;
        if (elapsed < acc) {
          if (currentStep !== i) {
            currentStep = i;
            setStepIndex(i);
          }
          break;
        }
      }
    }, 80);

    return () => clearInterval(interval);
  }, [dlState]);

  async function handleDownload(e: React.MouseEvent<HTMLAnchorElement>) {
    if (dlState !== "idle" && dlState !== "error") return;
    e.preventDefault();
    setDlState("loading");
    setDlError(null);

    try {
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        let errorMsg = "Could not download this video. Please try again.";
        try {
          const data = await response.json();
          if (data.error) errorMsg = data.error;
        } catch {}
        setDlState("error");
        setDlError(errorMsg);
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        let errorMsg = "Could not download this video. Please try again.";
        try {
          const data = await response.json();
          if (data.error) errorMsg = data.error;
        } catch {}
        setDlState("error");
        setDlError(errorMsg);
        return;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${video.title || "audio"}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setDlState("done");
      setTimeout(() => setDlState("idle"), 4000);
    } catch {
      setDlState("error");
      setDlError("Download failed. Please check your connection and try again.");
    }
  }

  const currentStep = PROCESSING_STEPS[stepIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-3xl mt-8"
    >
      <div className="glass-panel rounded-3xl overflow-hidden flex flex-col md:flex-row group">
        
        {/* Thumbnail Section */}
        <div className="relative md:w-2/5 aspect-video md:aspect-auto overflow-hidden">
          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10 duration-500" />
          <img 
            src={video.thumbnail} 
            alt={video.title} 
            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
          />
          <div className="absolute bottom-3 right-3 z-20 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md flex items-center gap-1.5 border border-white/10 text-xs font-medium text-white shadow-lg">
            <Clock className="w-3.5 h-3.5 text-primary" />
            {formatDuration(video.duration)}
          </div>
          
          <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="bg-primary/90 text-white rounded-full p-3 shadow-[0_0_30px_rgba(255,0,0,0.5)]">
              <PlayCircle className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6 md:p-8 flex flex-col justify-between flex-1 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider">
                Ready to Download
              </span>
            </div>
            
            <h3 className="text-xl md:text-2xl font-display font-bold text-foreground leading-tight line-clamp-2 mb-2 group-hover:text-primary transition-colors">
              {video.title}
            </h3>
            
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
              <User className="w-4 h-4" />
              <span>{video.author}</span>
            </div>
          </div>

          <div className="mt-8 relative z-10">
            <a
              href={downloadUrl}
              onClick={handleDownload}
              className={`inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-base shadow-lg transition-all duration-300 select-none
                ${dlState === "idle" ? "bg-primary text-white shadow-primary/30 hover:bg-primary/90 active:scale-95 cursor-pointer group/btn" : ""}
                ${dlState === "loading" ? "bg-primary/80 text-white cursor-not-allowed shadow-primary/20" : ""}
                ${dlState === "done" ? "bg-green-600 text-white shadow-green-600/30 cursor-default" : ""}
                ${dlState === "error" ? "bg-red-600 text-white shadow-red-600/30 hover:bg-red-500 active:scale-95 cursor-pointer" : ""}
              `}
            >
              {(dlState === "idle" || dlState === "error") && (
                <>
                  <Download className="w-5 h-5 group-hover/btn:-translate-y-1 transition-transform" />
                  {dlState === "error" ? "Try Again" : "Download MP3"}
                </>
              )}
              {dlState === "loading" && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={stepIndex}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center gap-2"
                  >
                    <span>{currentStep.icon}</span>
                    {currentStep.label}
                  </motion.span>
                </AnimatePresence>
              )}
              {dlState === "done" && (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Download started!
                </>
              )}
            </a>

            {dlState === "loading" && (
              <div className="mt-4 w-full sm:w-72">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${progress}%` }}
                    transition={{ duration: 0.08 }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  {PROCESSING_STEPS.map((step, i) => (
                    <motion.div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                        i <= stepIndex ? "bg-primary" : "bg-white/20"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {dlError && (
              <p className="text-center sm:text-left text-xs text-red-400 mt-3 flex items-center gap-1.5 justify-center sm:justify-start">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {dlError}
              </p>
            )}

            {!dlError && (
              <p className="text-center sm:text-left text-xs text-muted-foreground mt-4 flex items-center gap-1.5 justify-center sm:justify-start">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                High quality audio extraction
              </p>
            )}
          </div>
        </div>
        
      </div>
    </motion.div>
  );
}
