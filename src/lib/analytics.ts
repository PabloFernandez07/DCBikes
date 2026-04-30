import { supabase } from './supabase'

const SESSION_KEY = 'dcb_session'

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export async function trackProductView(productId: string) {
  await supabase.from('product_views').insert({
    product_id: productId,
    session_id: getSessionId(),
  })
}

export async function trackSearch(term: string, resultsCount: number) {
  const trimmed = term.trim().toLowerCase()
  if (!trimmed) return
  await supabase.from('search_queries').insert({
    term: trimmed,
    results_count: resultsCount,
  })
}
