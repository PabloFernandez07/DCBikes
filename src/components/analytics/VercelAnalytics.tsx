import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { hasAnalyticsConsent } from '@/components/layout/CookieBanner'

/**
 * Vercel Analytics + Speed Insights, gateados por el consentimiento de cookies
 * analíticas (coherente con la analítica propia). Se activan/desactivan al
 * instante cuando el usuario cambia su consentimiento (evento cookie-consent-change).
 * Sin consentimiento no se cargan ni sus scripts ni sus beacons.
 */
export function VercelAnalytics() {
  const [enabled, setEnabled] = useState<boolean>(() => hasAnalyticsConsent())

  useEffect(() => {
    const update = () => setEnabled(hasAnalyticsConsent())
    window.addEventListener('cookie-consent-change', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('cookie-consent-change', update)
      window.removeEventListener('storage', update)
    }
  }, [])

  if (!enabled) return null
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
