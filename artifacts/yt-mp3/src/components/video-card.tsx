import { useState } from "react";
import { motion } from "framer-motion";
import { Download, PlayCircle, Clock, User, Loader2, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { VideoInfo } from "@workspace/api-client-react/src/generated/api.schemas";
import { getDownloadUrl } from "@/hooks/use-youtube";

interface VideoCardProps {
  video: VideoInfo;
  url: string;
}

export function VideoCard({ video, url }: VideoCardProps) {
  const downloadUrl = getDownloadUrl(url);
  const [dlState, setDlState] = useState<"idle" | "loading" | "done">("idle");

  function handleDownload(e: React.MouseEvent<HTMLAnchorElement>) {
    if (dlState !== "idle") return;
    e.preventDefault();
    setDlState("loading");

    // Trigger real download after short delay to let state render
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Switch to "done" after a few seconds
      setTimeout(() => {
        setDlState("done");
        setTimeout(() => setDlState("idle"), 3000);
      }, 2000);
    }, 100);
  }

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
          
          {/* Decorative Play Button Overlay */}
          <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="bg-primary/90 text-white rounded-full p-3 shadow-[0_0_30px_rgba(255,0,0,0.5)]">
              <PlayCircle className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6 md:p-8 flex flex-col justify-between flex-1 relative">
          {/* Subtle gradient glow inside card */}
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
                ${dlState === "loading" ? "bg-primary/70 text-white cursor-not-allowed shadow-primary/20" : ""}
                ${dlState === "done" ? "bg-green-600 text-white shadow-green-600/30 cursor-default" : ""}
              `}
            >
              {dlState === "idle" && (
                <>
                  <Download className="w-5 h-5 group-hover/btn:-translate-y-1 transition-transform" />
                  Download MP3
                </>
              )}
              {dlState === "loading" && (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Preparing download…
                </>
              )}
              {dlState === "done" && (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Download started!
                </>
              )}
            </a>

            {/* Progress bar shown while loading */}
            {dlState === "loading" && (
              <div className="mt-3 w-full sm:w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "90%" }}
                  transition={{ duration: 4, ease: "easeInOut" }}
                />
              </div>
            )}

            <p className="text-center sm:text-left text-xs text-muted-foreground mt-4 flex items-center gap-1.5 justify-center sm:justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              High quality audio extraction
            </p>
          </div>
        </div>
        
      </div>
    </motion.div>
  );
}
