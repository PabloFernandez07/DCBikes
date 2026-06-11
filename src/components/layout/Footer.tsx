import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchedule } from '@/hooks/useSchedule'
import { useLegalIdentity } from '@/hooks/useLegalIdentity'
import { LAST_AUDIT_DATE, AUDIT_VERSION } from '@/lib/legal-versions'

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  )
}

interface SiteSettings {
  address?: string
  phone?: string
  instagram?: string
  facebook?: string
}

export function Footer() {
  const [settings, setSettings] = useState<SiteSettings>({})
  const legal = useLegalIdentity()
  const { schedule, isOpen, today } = useSchedule()

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['store_address', 'store_phone', 'social_instagram', 'social_facebook'])
      .then(({ data }) => {
        if (!data) return
        const obj: SiteSettings = {}
        data.forEach(row => {
          const map: Record<string, keyof SiteSettings> = {
            store_address: 'address',
            store_phone: 'phone',
            social_instagram: 'instagram',
            social_facebook: 'facebook',
          }
          const key = map[row.key]
          if (key) {
            const raw = row.value
            try {
              const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
              const v = parsed && String(parsed).trim() ? String(parsed) : ''
              if (v) (obj as Record<string, unknown>)[key] = v
            } catch {
              const v = raw && String(raw).trim() ? String(raw) : ''
              if (v) (obj as Record<string, unknown>)[key] = v
            }
          }
        })
        setSettings(obj)
      })
  }, [])

  // Horario de HOY (compacto) calculado desde el horario semanal de admin.
  // Ej: "09:30–13:00 · 17:00–20:00" o "Cerrado" si el día está vacío.
  const todayDay = schedule.find(d => d.label === today)
  const todayHours = todayDay
    ? (!todayDay.morning && !todayDay.afternoon)
      ? 'Cerrado'
      : [todayDay.morning, todayDay.afternoon].filter(Boolean).join(' · ')
    : null

  const year = new Date().getFullYear()

  return (
    <footer className="bg-[var(--color-ink-deep)] border-t border-[var(--color-card)] mt-16 md:mt-24">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12">
          <div className="flex flex-col gap-4">
            <img src="/DC_Bikes_Sin_Fondo.png" alt="DC Bikes" className="h-20 w-auto max-w-[200px] object-contain block" />
            <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed">
              DC Bikes Cantabria · El Astillero
              <br />
              Tu tienda de bicicletas en Cantabria.
            </p>
            <div className="flex gap-3 mt-1">
              {settings.instagram && (
                <a
                  href={settings.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.1)] transition-colors"
                  title="Instagram — abre nueva pestaña, sales del sitio"
                  aria-label="Instagram (abre en una nueva pestaña, sales del sitio)"
                >
                  <InstagramIcon size={18} />
                </a>
              )}
              {settings.facebook && (
                <a
                  href={settings.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.1)] transition-colors"
                  title="Facebook — abre nueva pestaña, sales del sitio"
                  aria-label="Facebook (abre en una nueva pestaña, sales del sitio)"
                >
                  <FacebookIcon size={18} />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] tracking-widest uppercase">
              Contacto
            </h3>
            {settings.address && (
              <div className="flex items-start gap-2 text-[var(--color-mid)] text-sm">
                <MapPin size={15} className="mt-0.5 shrink-0 text-[var(--color-lavender)]" />
                <span>{settings.address}</span>
              </div>
            )}
            {settings.phone && (
              <div className="flex items-center gap-2 text-[var(--color-mid)] text-sm">
                <Phone size={15} className="shrink-0 text-[var(--color-lavender)]" />
                <a href={`tel:${settings.phone}`} className="hover:text-[var(--color-cream)] transition-colors">
                  {settings.phone}
                </a>
              </div>
            )}
            {todayHours && (
              <div className="flex items-start gap-2 text-[var(--color-mid)] text-sm">
                <Clock size={15} className="mt-0.5 shrink-0 text-[var(--color-lavender)]" />
                <div>
                  <p>
                    <span className="font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)]">{today}:</span>{' '}
                    <span className={todayHours === 'Cerrado' ? '' : 'text-[var(--color-cream)]'}>{todayHours}</span>
                  </p>
                  <p className="text-xs mt-0.5 flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: isOpen ? '#22c55e' : 'var(--color-mid)' }}
                    />
                    <span style={{ color: isOpen ? '#22c55e' : 'var(--color-mid)' }}>
                      {isOpen ? 'Abierto ahora' : 'Cerrado ahora'}
                    </span>
                  </p>
                </div>
              </div>
            )}
            {!settings.address && !settings.phone && !todayHours && (
              <div className="flex flex-col gap-2 text-[var(--color-mid)] text-sm">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-[var(--color-lavender)]" />
                  <span>El Astillero, Cantabria</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] tracking-widest uppercase">
              Bicicletas
            </h3>
            <nav className="flex flex-col gap-2" aria-label="Tipos y marcas de bicicletas">
              {[
                { to: '/bicicletas-giant', label: 'Giant' },
                { to: '/bicicletas-liv', label: 'Liv' },
                { to: '/bicicletas-stevens', label: 'Stevens' },
                { to: '/bicicletas-electricas', label: 'Eléctricas' },
                { to: '/bicicletas-montana', label: 'De montaña (MTB)' },
                { to: '/bicicletas-carretera', label: 'De carretera' },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-[var(--color-mid)] text-sm hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] tracking-widest uppercase">
              Tienda
            </h3>
            <nav className="flex flex-col gap-2" aria-label="Links del footer">
              {[
                { to: '/catalogo', label: 'Catálogo' },
                { to: '/taller', label: 'Taller & Servicio' },
                { to: '/tienda-bicicletas-el-astillero', label: 'Tienda en El Astillero' },
                { to: '/tienda-bicicletas-santander', label: 'Cerca de Santander' },
                { to: '/preguntas-frecuentes', label: 'Preguntas frecuentes' },
                { to: '/contacto', label: 'Contacto' },
                { to: '/mis-pedidos', label: 'Mis pedidos' },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-[var(--color-mid)] text-sm hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--color-card)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[var(--color-mid)] text-xs font-[var(--font-body)]">
              © {year} DC Bikes Cantabria. Todos los derechos reservados.
            </p>
            {(legal?.companyName || legal?.cif || legal?.address) && (
              <p className="text-[var(--color-mid)] text-xs font-[var(--font-body)] opacity-70">
                {/* B-1 auditoría V6: titular autónomo → su identificador fiscal es NIF, no CIF */}
                {[legal?.companyName, legal?.cif && `NIF: ${legal.cif}`, legal?.address].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="text-[var(--color-mid)] text-xs font-[var(--font-body)] opacity-70">
              Última revisión legal: {LAST_AUDIT_DATE} ({AUDIT_VERSION})
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center sm:justify-end">
            <Link to="/aviso-legal" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Aviso legal
            </Link>
            <Link to="/aviso-legal#accesibilidad" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Accesibilidad
            </Link>
            <Link to="/cookies" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Cookies
            </Link>
            <Link to="/privacidad" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Privacidad
            </Link>
            <Link to="/terminos-venta" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Términos de venta
            </Link>
            <Link to="/devoluciones" className="text-[var(--color-mid)] text-xs hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)]">
              Devoluciones
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
