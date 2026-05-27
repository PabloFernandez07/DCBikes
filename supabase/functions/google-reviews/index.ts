import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  const apiKey  = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? ''
  const placeId = Deno.env.get('GOOGLE_PLACE_ID') ?? ''

  if (!apiKey || !placeId) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY o GOOGLE_PLACE_ID no configurados' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?languageCode=es`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'rating,userRatingCount,reviews.rating,reviews.text,reviews.originalText,reviews.authorAttribution,reviews.relativePublishTimeDescription',
      },
    },
  )

  if (!res.ok) {
    const body = await res.text()
    return new Response(
      JSON.stringify({ error: `Google Places API error ${res.status}`, detail: body }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }

  const json = await res.json()

  return new Response(JSON.stringify(json), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
