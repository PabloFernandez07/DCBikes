import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface GoogleReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  profile_photo_url: string;
}

export interface PlaceData {
  rating: number;
  user_ratings_total: number;
  reviews: GoogleReview[];
}

export function useGoogleReviews() {
  const [data, setData] = useState<PlaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase.functions
      .invoke("google-reviews")
      .then(({ data: json, error: fnError }) => {
        if (fnError || !json) throw fnError ?? new Error("empty response");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reviews: GoogleReview[] = Array.isArray(json.reviews)
          ? json.reviews
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((r: any) => {
                const t = r.text?.text ?? r.originalText?.text ?? "";
                return t.trim().length > 0;
              })
              .slice(0, 5)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((r: any) => ({
                author_name: r.authorAttribution?.displayName ?? "Cliente",
                rating: typeof r.rating === "number" ? r.rating : 5,
                relative_time_description:
                  r.relativePublishTimeDescription ?? "",
                text: r.text?.text ?? r.originalText?.text ?? "",
                profile_photo_url: r.authorAttribution?.photoUri ?? "",
              }))
          : [];

        setData({
          rating: typeof json.rating === "number" ? json.rating : 5,
          user_ratings_total:
            typeof json.userRatingCount === "number" ? json.userRatingCount : 0,
          reviews,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
