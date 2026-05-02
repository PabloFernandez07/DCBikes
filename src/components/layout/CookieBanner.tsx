import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'

type ConsentLevel = 'all' | 'essential' | null

interface CookiePreferences {
  essential: boolean
  analytics: boolean
  marketing: boolean
}

const STORAGE_KEY = 'dcbikes_cookie_consent'

export function useCookieConsent() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? (JSON.parse(stored) as CookiePreferences) : null
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [prefs, setPrefs] = useState<CookiePreferences>({
    essential: true,
    analytics: true,
    marketing: false,
  })

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const save = (level: ConsentLevel, custom?: CookiePreferences) => {
    const consent: CookiePreferences =
      level === 'all'
        ? { essential: true, analytics: true, marketing: true }
        : level === 'essential'
          ? { essential: true, analytics: false, marketing: false }
          : (custom ?? prefs)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
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
              Puedes aceptarlas, rechazar las no esenciales o{' '}
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline transition-all"
              >
                personalizar tu elección
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => save('essential')}
              className="flex-1 sm:flex-none text-xs"
            >
              Solo esenciales
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => save('all')}
              className="flex-1 sm:flex-none text-xs font-[var(--font-cond)] tracking-wide"
            >
              Aceptar todas
            </Button>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-ink)] transition-colors"
              aria-label={expanded ? 'Cerrar opciones' : 'Personalizar'}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
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
