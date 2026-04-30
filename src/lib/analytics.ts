import { supabase } from './supabase'

const SESSION_KEY = 'dcb_session'
const CONSENT_KEY = 'dcbikes_cookie_consent'

function hasAnalyticsConsent(): boolean {
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (!stored) return false
    const prefs = JSON.parse(stored) as { analytics?: boolean }
    return prefs.analytics === true
  } catch {
    return false
  }
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export async function trackProductView(productId: string) {
  if (!hasAnalyticsConsent()) return
  await supabase.from('product_views').insert({
    product_id: productId,
    session_id: getSessionId(),
  })
}

export async function trackSearch(term: string, resultsCount: number) {
  if (!hasAnalyticsConsent()) return
  const trimmed = term.trim().toLowerCase()
  if (!trimmed) return
  await supabase.from('search_queries').insert({
    term: trimmed,
    results_count: resultsCount,
  })
}
