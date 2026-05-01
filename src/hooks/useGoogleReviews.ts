import { useEffect, useState } from "react";

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
    const placeId = import.meta.env.VITE_GOOGLE_PLACE_ID as string;
    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string;

    if (!placeId || !apiKey) {
      setError(true);
      setLoading(false);
      return;
    }

    // Places API (New) — endpoint REST, no requiere Maps JS API
    fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=es`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "rating,userRatingCount,reviews.rating,reviews.text,reviews.originalText,reviews.authorAttribution,reviews.relativePublishTimeDescription",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reviews: GoogleReview[] = Array.isArray(json.reviews)
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            json.reviews
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
            typeof json.userRatingCount === "number"
              ? json.userRatingCount
              : 0,
          reviews,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
