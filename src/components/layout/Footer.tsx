import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Clock } from 'lucide-react'

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
import { supabase } from '@/lib/supabase'

interface SiteSettings {
  address?: string
  phone?: string
  hours?: string
  instagram?: string
  facebook?: string
}

export function Footer() {
  const [settings, setSettings] = useState<SiteSettings>({})

  useEffect(() => {
    const keys = ['address', 'phone', 'hours', 'instagram', 'facebook']
    supabase
      .from('settings')
      .select('key, value')
      .in('key', keys)
      .then(({ data }) => {
        if (!data) return
        const obj: SiteSettings = {}
        data.forEach(row => {
          (obj as Record<string, unknown>)[row.key] = row.value
        })
        setSettings(obj)
      })
  }, [])

  const year = new Date().getFullYear()

  return (
    <footer className="bg-[var(--color-ink-deep)] border-t border-[var(--color-card)] mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="flex flex-col gap-4">
            <img src="/DC_Bikes_Sin_Fondo.png" alt="DC Bikes" className="h-10 w-auto" />
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
                  aria-label="Instagram"
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
                  aria-label="Facebook"
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
            {settings.hours && (
              <div className="flex items-start gap-2 text-[var(--color-mid)] text-sm">
                <Clock size={15} className="mt-0.5 shrink-0 text-[var(--color-lavender)]" />
                <span className="whitespace-pre-line">{settings.hours}</span>
              </div>
            )}
            {!settings.address && !settings.phone && !settings.hours && (
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
              Tienda
            </h3>
            <nav className="flex flex-col gap-2" aria-label="Links del footer">
              {[
                { to: '/catalogo', label: 'Catálogo' },
                { to: '/taller', label: 'Taller & Servicio' },
                { to: '/contacto', label: 'Contacto' },
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
          <p className="text-[var(--color-mid)] text-xs font-[var(--font-body)]">
            © {year} DC Bikes Cantabria. Todos los derechos reservados.
          </p>
          <div className="flex gap-4">
            {['Aviso legal', 'Privacidad', 'Cookies'].map(label => (
              <span key={label} className="text-[var(--color-mid)] text-xs cursor-default hover:text-[var(--color-mid)]/70 transition-colors">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
