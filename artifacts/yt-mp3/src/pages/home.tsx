import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Youtube, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { VideoCard } from "@/components/video-card";
import { useYoutubeInfo } from "@/hooks/use-youtube";

export default function Home() {
  const [inputUrl, setInputUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  const { data: videoInfo, isLoading, isError, errorMessage } = useYoutubeInfo(activeUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    if (!inputUrl.includes("youtube.com") && !inputUrl.includes("youtu.be")) {
      setActiveUrl("invalid_trigger_error");
    } else {
      setActiveUrl(inputUrl);
    }
  };

  const isInvalidUrlFormat = activeUrl === "invalid_trigger_error";
  const hasResult = videoInfo || isLoading || isError || isInvalidUrlFormat;

  return (
    <div className="h-screen flex flex-col overflow-auto relative z-0">

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-4 z-10 w-full max-w-5xl mx-auto">

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-4 w-full"
        >
          <h2 className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground mb-3 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Fastest YouTube Converter
          </h2>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-extrabold tracking-tight mb-3">
            YouTube to <span className="text-gradient from-primary to-rose-400">MP3 Converter</span>
          </h1>

          <h2 className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
            Paste any YouTube link below to instantly extract the audio.
            No limits, no registration required.
          </h2>
        </motion.div>

        {/* Input Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-3xl relative"
        >
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-rose-500/30 rounded-[2rem] blur opacity-30 group-hover:opacity-70 transition duration-500"></div>
            <div className="relative flex items-center p-2 rounded-3xl bg-card border border-white/10 shadow-2xl backdrop-blur-xl">
              <div className="pl-4 pr-2 text-muted-foreground">
                <Youtube className="w-5 h-5 group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit(e as any)}
                className="flex-1 bg-transparent border-none text-foreground text-base px-2 py-3 focus:outline-none placeholder:text-muted-foreground/60 w-full min-w-0"
                disabled={isLoading}
              />
              <a
                href={inputUrl.trim() || undefined}
                onClick={handleSubmit}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl shrink-0 min-w-[110px] px-5 py-2.5 font-semibold text-sm text-white transition-all duration-150 shadow-lg
                  ${isLoading || !inputUrl.trim()
                    ? "bg-primary/50 cursor-not-allowed pointer-events-none"
                    : "bg-primary hover:bg-primary/90 active:scale-95 cursor-pointer"
                  }`}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Fetch <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </a>
            </div>
          </div>
        </motion.div>

        {/* Ad Banner */}
        <div className="mt-4 w-full flex justify-center">
          <!-- Bidroy - Ad Display Code -->
<div id="adm-container-362"></div><script data-cfasync="false" async type="text/javascript" src="//digitalroys.com/display/items.php?362&48&728&90&4&0&64"></script>
<!-- Bidroy - Ad Display Code -->
        </div>

        {/* Results / States */}
        {hasResult && (
          <div className="w-full flex justify-center mt-2">
            <AnimatePresence mode="wait">

              {/* Loading State */}
              {isLoading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-6 flex flex-col items-center gap-3 text-muted-foreground"
                >
                  <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <p className="font-medium animate-pulse">Extracting video data...</p>
                </motion.div>
              )}

              {/* Error State */}
              {(isError || isInvalidUrlFormat) && !isLoading && activeUrl && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mt-6 w-full max-w-2xl bg-destructive/10 border border-destructive/20 rounded-2xl p-5 flex items-start gap-4"
                >
                  <div className="bg-destructive/20 p-2 rounded-full shrink-0">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-destructive mb-1">Could not process video</h3>
                    <p className="text-sm text-destructive-foreground/80">
                      {isInvalidUrlFormat
                        ? "Please enter a valid YouTube URL."
                        : errorMessage}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Success State */}
              {videoInfo && !isLoading && !isError && (
                <VideoCard key="result" video={videoInfo} url={activeUrl} />
              )}

            </AnimatePresence>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-muted-foreground text-xs z-10 border-t border-white/5 bg-background/50 backdrop-blur-md shrink-0">
        <p>Powered by U2MP3.COM</p>
      </footer>
    </div>
  );
}
