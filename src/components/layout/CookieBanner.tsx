import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ChevronDown, ChevronUp, Shield, Map } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'

type ConsentLevel = 'all' | 'reject' | null

interface CookiePreferences {
  essential: boolean
  analytics: boolean
  marketing: boolean
  thirdParty: boolean
}

interface StoredConsent extends CookiePreferences {
  savedAt: string
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
    return {
      essential: true,
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      thirdParty: !!parsed.thirdParty,
      savedAt: parsed.savedAt,
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

export function hasMarketingConsent(): boolean {
  return readStored()?.marketing === true
}

export function hasThirdPartyConsent(): boolean {
  return readStored()?.thirdParty === true
}

export function setThirdPartyConsent(value: boolean): void {
  const current = readStored() ?? { essential: true, analytics: false, marketing: false, thirdParty: false, savedAt: new Date().toISOString() }
  const next: StoredConsent = { ...current, thirdParty: value, savedAt: new Date().toISOString() }
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
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const save = (level: ConsentLevel, custom?: CookiePreferences) => {
    const consent: CookiePreferences =
      level === 'all'
        ? { essential: true, analytics: true, marketing: true, thirdParty: true }
        : level === 'reject'
          ? { essential: true, analytics: false, marketing: false, thirdParty: false }
          : (custom ?? prefs)

    const stored: StoredConsent = {
      ...consent,
      savedAt: new Date().toISOString(),
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
              <Cookie size={20} className="text-[var(--color-lavender)]" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] text-sm tracking-wide mb-0.5">
              Usamos cookies
            </p>
            <p className="text-[var(--color-mid)] font-[var(--font-body)] text-xs leading-relaxed">
              Utilizamos cookies propias y de terceros para analizar el uso de la web y mejorar tu experiencia.
              Puedes aceptarlas, rechazarlas o{' '}
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline transition-all"
              >
                configurar tu elección
              </button>
              . Más info en nuestra{' '}
              <Link
                to="/cookies"
                className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline transition-all"
              >
                política de cookies
              </Link>
              .
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {/* Botones principales con MISMA prominencia visual (variant primary, mismo size, mismo peso). */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => save('reject')}
              className="flex-1 sm:flex-none text-xs font-[var(--font-cond)] tracking-wide"
            >
              Rechazar todas
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => save('all')}
              className="flex-1 sm:flex-none text-xs font-[var(--font-cond)] tracking-wide"
            >
              Aceptar todas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(v => !v)}
              className="text-xs font-[var(--font-cond)] tracking-wide"
              aria-expanded={expanded}
            >
              Configurar
              {expanded ? (
                <ChevronDown size={14} className="ml-1" />
              ) : (
                <ChevronUp size={14} className="ml-1" />
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
              icon={<Shield size={14} />}
              title="Cookies esenciales"
              description="Necesarias para el funcionamiento básico de la web. No pueden desactivarse."
              checked={true}
              disabled
              onChange={() => {}}
            />
            <CookieToggle
              icon={<span className="text-[10px] font-bold">📊</span>}
              title="Cookies analíticas"
              description="Nos ayudan a entender cómo navegas por la web para mejorar el servicio (visitas a productos, búsquedas)."
              checked={prefs.analytics}
              onChange={v => setPrefs(p => ({ ...p, analytics: v }))}
            />
            <CookieToggle
              icon={<span className="text-[10px] font-bold">🎯</span>}
              title="Cookies de marketing"
              description="Permiten mostrarte contenido personalizado en redes sociales y plataformas externas."
              checked={prefs.marketing}
              onChange={v => setPrefs(p => ({ ...p, marketing: v }))}
            />
            <CookieToggle
              icon={<Map size={14} />}
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
