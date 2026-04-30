import { useEffect, useRef, useState } from 'react'
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
import { QuoteModal } from '@/components/public/QuoteModal'
import { Button } from '@/components/ui/Button'

interface SiteSettings {
  address?: string
  phone?: string
  hours?: string
  instagram?: string
  facebook?: string
  maps_embed?: string
}

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.1 },
    )
    el.querySelectorAll('.rv').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return ref
}

export default function Contact() {
  const [settings, setSettings] = useState<SiteSettings>({})
  const [quoteOpen, setQuoteOpen] = useState(false)
  const pageRef = useReveal()

  useEffect(() => {
    const keys = ['address', 'phone', 'hours', 'instagram', 'facebook', 'maps_embed']
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

  const defaultEmbedSrc =
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2905.8!2d-3.8202!3d43.3961!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4967c3c2d18b2b%3A0x0!2sEl%20Astillero%2C%20Cantabria!5e0!3m2!1ses!2ses!4v1680000000000!5m2!1ses!2ses'

  return (
    <div ref={pageRef}>
      {/* Header */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
          Dónde estamos
        </p>
        <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none">
          CONTACTO
        </h1>
      </section>

      {/* Map + contact info */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rv grid lg:grid-cols-2 gap-8">
          {/* Map */}
          <div className="rounded-2xl overflow-hidden bg-[var(--color-card)] h-[400px] lg:h-auto min-h-[400px]">
            <iframe
              src={settings.maps_embed ?? defaultEmbedSrc}
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: '400px' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Ubicación DC Bikes Cantabria"
            />
          </div>

          {/* Contact details */}
          <div className="flex flex-col gap-6 p-8 lg:p-10 bg-[var(--color-card)] rounded-2xl border border-[var(--color-mid)]/10">
            <h2 className="font-[var(--font-cond)] text-2xl font-semibold text-[var(--color-cream)] tracking-wide">
              Información de contacto
            </h2>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-[var(--color-lavender)] mt-0.5 shrink-0" />
                <div>
                  <p className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-widest uppercase mb-1">Dirección</p>
                  <p className="text-[var(--color-cream)] font-[var(--font-body)] text-sm">
                    {settings.address ?? 'El Astillero, Cantabria'}
                  </p>
                </div>
              </div>

              {settings.phone && (
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-[var(--color-lavender)] mt-0.5 shrink-0" />
                  <div>
                    <p className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-widest uppercase mb-1">Teléfono</p>
                    <a
                      href={`tel:${settings.phone}`}
                      className="text-[var(--color-cream)] font-[var(--font-body)] text-sm hover:text-[var(--color-lavender)] transition-colors"
                    >
                      {settings.phone}
                    </a>
                  </div>
                </div>
              )}

              {settings.hours && (
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-[var(--color-lavender)] mt-0.5 shrink-0" />
                  <div>
                    <p className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-widest uppercase mb-1">Horario</p>
                    <p className="text-[var(--color-cream)] font-[var(--font-body)] text-sm whitespace-pre-line">
                      {settings.hours}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {settings.instagram && (
                  <a
                    href={settings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-card)] text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:border-[rgba(196,162,207,0.3)] transition-all text-sm font-[var(--font-cond)]"
                    aria-label="Instagram"
                  >
                    <InstagramIcon size={16} />
                    Instagram
                  </a>
                )}
                {settings.facebook && (
                  <a
                    href={settings.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-card)] text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:border-[rgba(196,162,207,0.3)] transition-all text-sm font-[var(--font-cond)]"
                    aria-label="Facebook"
                  >
                    <FacebookIcon size={16} />
                    Facebook
                  </a>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--color-mid)]/20">
              <p className="text-[var(--color-mid)] text-sm mb-4 font-[var(--font-body)]">
                ¿Tienes alguna consulta? Envíanos un mensaje y te responderemos lo antes posible.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => setQuoteOpen(true)}
                className="w-full font-[var(--font-cond)] tracking-wide"
              >
                Enviar consulta
              </Button>
            </div>
          </div>
        </div>
      </section>

      {quoteOpen && <QuoteModal productId={null} onClose={() => setQuoteOpen(false)} />}
    </div>
  )
}
