import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ChevronDown, ChevronUp, Shield, Map, BarChart3 } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { COOKIES_VERSION } from '@/lib/legal-versions'

type ConsentLevel = 'all' | 'reject' | null

interface CookiePreferences {
  essential: boolean
  analytics: boolean
  marketing: boolean
  thirdParty: boolean
}

interface StoredConsent extends CookiePreferences {
  savedAt: string
  cookies_version: string  // P-12: versión de política de cookies; mismatch fuerza re-consent
}

const STORAGE_KEY = 'dcbikes_cookie_consent'
// TTL de 12 meses (365 días) por RGPD: el consentimiento expira y debe volver a solicitarse.
const TTL_MS = 365 * 24 * 60 * 60 * 1000

function readStored(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredConsent>
    if (!parsed || typeof parsed !== 'object') return null
    // Si no tiene savedAt asumimos formato antiguo → tratamos como caducado.
    if (!parsed.savedAt) return null
    const age = Date.now() - new Date(parsed.savedAt).getTime()
    if (Number.isNaN(age) || age > TTL_MS) return null
    // P-12: si la versión guardada no coincide con la actual, descarta el consent y fuerza re-consent.
    if (parsed.cookies_version !== COOKIES_VERSION) return null
    return {
      essential: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      thirdParty: !!parsed.thirdParty,
      savedAt: parsed.savedAt,
      cookies_version: COOKIES_VERSION,
    }
  } catch {
    return null
  }
}

export function useCookieConsent(): CookiePreferences | null {
  return readStored()
}

export function hasAnalyticsConsent(): boolean {
  return readStored()?.analytics === true
}

// P-05: toggle marketing eliminado porque no existe tratamiento de marketing real.
// Si en el futuro hay newsletter, reintroducir con doble opt-in declarado.
// Este helper se mantiene devolviendo siempre false para compatibilidad con lecturas residuales.
export function hasMarketingConsent(): boolean {
  return false
}

export function hasThirdPartyConsent(): boolean {
  return readStored()?.thirdParty === true
}

export function setThirdPartyConsent(value: boolean): void {
  const current = readStored() ?? { essential: true, analytics: false, marketing: false, thirdParty: false, savedAt: new Date().toISOString(), cookies_version: COOKIES_VERSION }
  const next: StoredConsent = { ...current, thirdParty: value, savedAt: new Date().toISOString(), cookies_version: COOKIES_VERSION }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('cookie-consent-change', { detail: next }))
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [prefs, setPrefs] = useState<CookiePreferences>({
    essential: true,
    analytics: false,
    marketing: false,
    thirdParty: false,
  })

  useEffect(() => {
    const stored = readStored()
    if (!stored) {
      // F-10 (V5): AEPD exige que el banner aparezca de forma inmediata, sin delays
      // que sugieran "consentimiento ya otorgado" mientras se navega.
      setVisible(true)
    }
  }, [])

  const save = (level: ConsentLevel, custom?: CookiePreferences) => {
    // P-05: marketing siempre false — no existe tratamiento de marketing real.
    const consent: CookiePreferences =
      level === 'all'
        ? { essential: true, analytics: true, marketing: false, thirdParty: true }
        : level === 'reject'
          ? { essential: true, analytics: false, marketing: false, thirdParty: false }
          : (custom ?? prefs)

    const stored: StoredConsent = {
      ...consent,
      savedAt: new Date().toISOString(),
      cookies_version: COOKIES_VERSION,  // P-12: versiona el consent para forzar re-consent en cambios de política
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className={clsx(
        'fixed bottom-0 left-0 right-0 z-50',
        'animate-[fadeUp_0.4s_ease_forwards]',
      )}
      role="dialog"
      aria-label="Aviso de cookies"
      aria-modal="false"
    >
      <div className="w-full bg-[var(--color-card)] border-t border-[var(--color-lavender)]/20 shadow-[0_-8px_40px_rgba(0,0,0,0.4)] overflow-hidden">
        {/* Main row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center">
              <Cookie size={20} className="text-[var(--color-lavender)]" aria-hidden="true" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* P-06: literal actualizado — fiel a la realidad técnica (técnicas + mapa opcional, sin marketing ni analítica de terceros). */}
            <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] text-sm tracking-wide mb-0.5">
              Cookies técnicas y mapa opcional
            </p>
            <p className="text-[var(--color-mid)] font-[var(--font-body)] text-xs leading-relaxed">
              Esta web usa cookies y almacenamiento técnicos imprescindibles para funcionamiento, seguridad y
              prevención de fraude (Cloudflare Turnstile). En la página de contacto cargamos opcionalmente el
              mapa de Google Maps si das tu consentimiento. No usamos cookies de marketing ni analítica de
              terceros. Puedes{' '}
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline transition-all"
              >
                configurar tu elección
              </button>
              {' '}o consultar nuestra{' '}
              <Link
                to="/cookies"
                className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline transition-all"
              >
                política de cookies
              </Link>
              .
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {/* Botones principales con MISMA prominencia visual (variant primary, mismo size, mismo peso). */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => save('reject')}
              className="w-full sm:w-auto sm:flex-none min-h-11 sm:min-h-0 text-xs font-[var(--font-cond)] tracking-wide"
            >
              Rechazar todas
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => save('all')}
              className="w-full sm:w-auto sm:flex-none min-h-11 sm:min-h-0 text-xs font-[var(--font-cond)] tracking-wide"
            >
              Aceptar todas
            </Button>
            {/* F-11 (V5): AEPD exige que "Configurar" tenga el mismo peso visual que
                "Aceptar todas" y "Rechazar todas" (variant equivalente, no ghost). */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExpanded(v => !v)}
              className="col-span-2 w-full sm:w-auto sm:flex-none min-h-11 sm:min-h-0 text-xs font-[var(--font-cond)] tracking-wide"
              aria-expanded={expanded}
            >
              Configurar
              {expanded ? (
                <ChevronDown size={14} className="ml-1" aria-hidden="true" />
              ) : (
                <ChevronUp size={14} className="ml-1" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded preferences */}
        {expanded && (
          <div className="border-t border-[var(--color-card-hover)] px-5 sm:px-6 pb-5 pt-4 space-y-3">
            <p className="font-[var(--font-cond)] text-xs text-[var(--color-mid)] tracking-widest uppercase mb-3">
              Personalizar preferencias
            </p>

            <CookieToggle
              icon={<Shield size={14} aria-hidden="true" />}
              title="Cookies esenciales"
              description="Necesarias para el funcionamiento básico de la web. No pueden desactivarse."
              checked={true}
              disabled
              onChange={() => {}}
            />
            <CookieToggle
              icon={<BarChart3 size={14} aria-hidden="true" />}
              title="Cookies analíticas"
              description="Nos ayudan a entender cómo navegas por la web para mejorar el servicio (visitas a productos, búsquedas)."
              checked={prefs.analytics}
              onChange={v => setPrefs(p => ({ ...p, analytics: v }))}
            />
            {/* P-05: toggle "Cookies de marketing" eliminado — no existe tratamiento de marketing real.
                Si en el futuro se implementa newsletter, reintroducir con doble opt-in declarado. */}
            <CookieToggle
              icon={<Map size={14} aria-hidden="true" />}
              title="Cookies de terceros funcionales (mapa de Google)"
              description="Permite cargar el mapa de Google que muestra la ubicación de la tienda en la página de contacto. Si rechazas, verás un enlace alternativo a Google Maps."
              checked={prefs.thirdParty}
              onChange={v => setPrefs(p => ({ ...p, thirdParty: v }))}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => save(null, prefs)}
                className="text-xs font-[var(--font-cond)] tracking-wide"
              >
                Guardar preferencias
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CookieToggle({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-ink)] border border-[var(--color-card-hover)]">
      <div className="w-7 h-7 rounded-lg bg-[var(--color-card)] flex items-center justify-center shrink-0 text-[var(--color-lavender)] mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide">
          {title}
        </p>
        <p className="text-[var(--color-mid)] font-[var(--font-body)] text-xs leading-relaxed mt-0.5">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 shrink-0 mt-0.5',
          checked ? 'bg-[var(--color-lavender)]' : 'bg-[var(--color-card)]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={clsx(
            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
