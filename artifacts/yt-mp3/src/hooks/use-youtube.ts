import { useGetVideoInfo } from "@workspace/api-client-react";
import { ErrorResponse } from "@workspace/api-client-react/src/generated/api.schemas";
import { ErrorType } from "@workspace/api-client-react/src/custom-fetch";

export function useYoutubeInfo(url: string) {
  // Extract video ID to determine if it's a vaguely valid youtube link
  // This prevents spamming the API with clearly invalid strings as the user types
  const isValidUrlFormat = url.includes("youtube.com") || url.includes("youtu.be");
  
  const query = useGetVideoInfo(
    { url },
    {
      query: {
        // Only run the query if there is a URL and it looks somewhat like a youtube URL
        enabled: !!url && isValidUrlFormat,
        retry: false,
        staleTime: 1000 * 60 * 5, // Cache valid results for 5 minutes
      },
    }
  );

  return {
    ...query,
    // Provide a typed error message accessor
    errorMessage: (query.error as ErrorType<ErrorResponse>)?.error?.error || "Failed to fetch video information."
  };
}

// Helper to generate the direct download URL
export function getDownloadUrl(url: string): string {
  if (!url) return "#";
  return `/api/youtube/download?url=${encodeURIComponent(url)}`;
}
