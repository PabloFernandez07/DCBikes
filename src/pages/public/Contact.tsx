import { useEffect, useRef, useState } from 'react'
import { MapPin, Phone, Clock, ArrowRight, MessageCircle, Navigation, Map } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { QuoteModal } from '@/components/public/QuoteModal'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { useSchedule } from '@/hooks/useSchedule'
import { useCookieConsent, setThirdPartyConsent } from '@/components/layout/CookieBanner'
import { STORE_ADDRESS_FALLBACK } from '@/hooks/useStoreAddress'
import { useReducedMotion } from '@/hooks/useReducedMotion'

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

interface SiteSettings {
  address?: string
  phone?: string
  instagram?: string
  facebook?: string
  maps_embed?: string
  maps_link?: string
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
  const { schedule, isOpen: open, today } = useSchedule()
  const [settings, setSettings] = useState<SiteSettings>({})
  const [quoteOpen, setQuoteOpen] = useState(false)
  const cookieConsent = useCookieConsent()
  const [mapsEnabled, setMapsEnabled] = useState(cookieConsent?.thirdParty ?? false)
  const pageRef = useReveal()
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['store_address', 'store_phone', 'social_instagram', 'social_facebook', 'maps_embed', 'maps_link'])
      .then(({ data }) => {
        if (!data) return
        const obj: SiteSettings = {}
        const map: Record<string, keyof SiteSettings> = {
          store_address: 'address',
          store_phone: 'phone',
          social_instagram: 'instagram',
          social_facebook: 'facebook',
          maps_embed: 'maps_embed',
          maps_link: 'maps_link',
        }
        data.forEach(row => {
          const key = map[row.key]
          if (key) (obj as Record<string, unknown>)[key] = row.value
        })
        setSettings(obj)
      })
  }, [])

  // OJO: maps.google.com bloquea el framing (ERR_BLOCKED_BY_RESPONSE).
  // El host que SÍ permite iframe es www.google.com/maps con output=embed.
  const defaultEmbedSrc =
    'https://www.google.com/maps?q=DC+Bikes+Cantabria%2C+C.+la+Cant%C3%A1brica%2C+39610+Astillero%2C+Cantabria&output=embed&z=17'

  // Normaliza cualquier embed guardado en ajustes que use el host bloqueado.
  const rawEmbed = settings.maps_embed ?? defaultEmbedSrc
  const mapEmbedSrc = rawEmbed.replace(
    /https?:\/\/maps\.google\.com\/maps/i,
    'https://www.google.com/maps',
  )

  const phone = settings.phone ?? null
  const address = settings.address ?? null


  return (
    <div ref={pageRef}>
      <SEO
        title="Contacto y horarios"
        description="Visítanos en El Astillero, Cantabria. Horarios, dirección, teléfono y mapa de DC Bikes Cantabria. Distribuidores Giant y Liv."
        url="https://dcbikescantabria.com/contacto"
        breadcrumbs={[
          { name: "Inicio", url: "https://dcbikescantabria.com" },
          { name: "Contacto", url: "https://dcbikescantabria.com/contacto" },
        ]}
      />
      {/* Hero */}
      <section className="relative py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 60% 60% at 15% 50%, rgba(196,162,207,0.07) 0%, transparent 70%)' }}
        />
        <span className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[20vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none" aria-hidden="true">
          CONTACTO
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Dónde estamos
          </p>
          <h1 className="rv font-[var(--font-display)] text-8xl lg:text-[10rem] text-[var(--color-cream)] tracking-wide leading-none">
            VISÍTANOS
          </h1>
          <p className="rv mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Estamos en El Astillero, Cantabria. Pásate por la tienda, llámanos o escríbenos Te atendemos con mucho gusto.
          </p>
          <div className="rv flex flex-wrap gap-4 mt-10" style={{ transitionDelay: '180ms' }}>
            <Button variant="primary" size="lg" onClick={() => setQuoteOpen(true)} className="font-[var(--font-display)] tracking-widest text-lg">
              <MessageCircle size={18} />
              Enviar consulta
            </Button>
            {phone && (
              <a href={`tel:${phone}`}>
                <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide">
                  <Phone size={16} />
                  Llamar ahora
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Info cards strip */}
      <section className="border-y border-[var(--color-card)] bg-[var(--color-ink-deep)] py-0">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-card)]">

            {/* Dirección */}
            <div className="flex items-start gap-4 py-8 sm:pr-8">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center shrink-0">
                <MapPin size={22} className="text-[var(--color-lavender)]" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] mb-1">Dirección</p>
                <p className="font-[var(--font-body)] text-sm text-[var(--color-cream)] leading-relaxed">
                  {address ?? STORE_ADDRESS_FALLBACK}
                </p>
                <a
                  href={settings.maps_link ?? 'https://maps.app.goo.gl/E2dajUcN3rA2fvc57'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs font-[var(--font-cond)] text-[var(--color-lavender)] hover:underline tracking-wide"
                >
                  <Navigation size={11} />
                  Cómo llegar
                </a>
              </div>
            </div>

            {/* Teléfono */}
            <div className="flex items-start gap-4 py-8 sm:px-8">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center shrink-0">
                <Phone size={22} className="text-[var(--color-lavender)]" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] mb-1">Teléfono</p>
                {phone ? (
                  <a href={`tel:${phone}`} className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide hover:text-[var(--color-lavender)] transition-colors">
                    {phone}
                  </a>
                ) : (
                  <span className="font-[var(--font-body)] text-sm text-[var(--color-mid)]">Configurable desde admin</span>
                )}
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-1">Respondemos en &lt; 24h</p>
              </div>
            </div>

            {/* Horario */}
            <div className="flex items-start gap-4 py-8 sm:pl-8">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center shrink-0">
                <Clock size={22} className="text-[var(--color-lavender)]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)]">Horario</p>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-[var(--font-cond)] tracking-wide"
                    style={{
                      background: open ? 'rgba(34,197,94,0.12)' : 'rgba(126,110,138,0.15)',
                      color: open ? '#22c55e' : 'var(--color-mid)',
                      border: `1px solid ${open ? 'rgba(34,197,94,0.3)' : 'rgba(126,110,138,0.2)'}`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: open ? '#22c55e' : 'var(--color-mid)' }}
                    />
                    {open ? 'Abierto ahora' : 'Cerrado ahora'}
                  </span>
                </div>
                <div className="space-y-1">
                  {schedule.map((day) => {
                    const isToday = day.label === today
                    const closed = !day.morning && !day.afternoon
                    return (
                      <div
                        key={day.label}
                        className="flex items-baseline gap-2 text-xs font-[var(--font-body)]"
                      >
                        <span
                          className="w-20 font-[var(--font-cond)] tracking-wide shrink-0"
                          style={{ color: isToday ? 'var(--color-lavender)' : 'var(--color-mid)' }}
                        >
                          {day.label}
                        </span>
                        <span style={{ color: closed ? 'var(--color-mid)' : 'var(--color-cream)' }}>
                          {closed
                            ? 'Cerrado'
                            : [day.morning, day.afternoon].filter(Boolean).join(' · ')}
                        </span>
                        {isToday && (
                          <span className="text-[var(--color-lavender)] text-[10px] font-[var(--font-cond)] tracking-widest uppercase">
                            hoy
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Map + social */}
      <section className="py-20 w-full px-4 sm:px-6 lg:px-8">
        <div className="rv grid lg:grid-cols-3 gap-6">

          {/* Map — ocupa 2/3 */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden bg-[var(--color-card)] h-[420px]">
            {mapsEnabled ? (
              <iframe
                src={mapEmbedSrc}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación DC Bikes Cantabria"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center">
                  <Map size={26} className="text-[var(--color-lavender)]" />
                </div>
                <div>
                  <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                    Mapa de Google Maps
                  </p>
                  <p className="text-[var(--color-mid)] font-[var(--font-body)] text-xs leading-relaxed max-w-xs">
                    Para ver el mapa, acepta las cookies de terceros en la configuración del banner de cookies. Mientras tanto, puedes abrir la ubicación directamente en Google Maps.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setThirdPartyConsent(true); setMapsEnabled(true) }}
                  aria-describedby="map-load-desc"
                  className="px-5 py-2 rounded-xl bg-[var(--color-lavender)]/15 hover:bg-[var(--color-lavender)]/25 border border-[var(--color-lavender)]/30 text-[var(--color-lavender)] font-[var(--font-cond)] text-sm tracking-wide transition-colors"
                >
                  Cargar mapa
                </button>
                <p id="map-load-desc" className="text-xs text-[var(--color-mid)] max-w-xs leading-relaxed">
                  Al cargar el mapa, Google Maps recibirá tu dirección IP y datos del navegador (DPF — política Google).
                </p>
                <a
                  href={settings.maps_link ?? 'https://maps.app.goo.gl/E2dajUcN3rA2fvc57'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-[var(--font-body)] text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors underline underline-offset-2"
                >
                  <Navigation size={11} />
                  Abrir en Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Side panel — 1/3 */}
          <div className="flex flex-col gap-5">
            {/* Redes sociales */}
            <div className="p-6 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] flex-1">
              <p className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-mid)] mb-4">Síguenos</p>
              <div className="flex flex-col gap-3">
                {settings.instagram ? (
                  <a
                    href={settings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-ink)] hover:bg-[rgba(196,162,207,0.08)] border border-transparent hover:border-[rgba(196,162,207,0.2)] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-[var(--color-lavender)] group-hover:scale-110 transition-transform">
                      <InstagramIcon size={18} />
                    </div>
                    <div>
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide">Instagram</p>
                      <p className="text-xs text-[var(--color-mid)]">@dcbikescantabria</p>
                    </div>
                    <ArrowRight size={14} className="ml-auto text-[var(--color-mid)] group-hover:text-[var(--color-lavender)] transition-colors" />
                  </a>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-ink)] border border-[var(--color-card-hover)]">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-[var(--color-lavender)]">
                      <InstagramIcon size={18} />
                    </div>
                    <div>
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide">Instagram</p>
                      <p className="text-xs text-[var(--color-mid)]">Configurable desde admin</p>
                    </div>
                  </div>
                )}
                {settings.facebook ? (
                  <a
                    href={settings.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-ink)] hover:bg-[rgba(196,162,207,0.08)] border border-transparent hover:border-[rgba(196,162,207,0.2)] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      <FacebookIcon size={18} />
                    </div>
                    <div>
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide">Facebook</p>
                      <p className="text-xs text-[var(--color-mid)]">DC Bikes Cantabria</p>
                    </div>
                    <ArrowRight size={14} className="ml-auto text-[var(--color-mid)] group-hover:text-[var(--color-lavender)] transition-colors" />
                  </a>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-ink)] border border-[var(--color-card-hover)]">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                      <FacebookIcon size={18} />
                    </div>
                    <div>
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide">Facebook</p>
                      <p className="text-xs text-[var(--color-mid)]">Configurable desde admin</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CTA consulta */}
            <div
              className="p-6 rounded-2xl relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(196,162,207,0.12) 0%, rgba(196,162,207,0.04) 100%)', border: '1px solid rgba(196,162,207,0.2)' }}
            >
              <p className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide mb-2">
                ¿TIENES DUDAS?
              </p>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed mb-5">
                Escríbenos y te respondemos en menos de 24 horas.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => setQuoteOpen(true)}
                className="w-full font-[var(--font-cond)] tracking-wide"
              >
                <MessageCircle size={16} />
                Enviar mensaje
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STORE GALLERY ─── */}
      <section className="py-20 w-full px-4 sm:px-6 lg:px-8">
        <div className="rv flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-brand-red)] mb-3">
              Fotos y vídeos
            </p>
            <h2 className="font-[var(--font-display)] text-6xl md:text-7xl text-[var(--color-cream)] leading-none tracking-wide">
              NUESTRA
              <br />
              <span className="text-[var(--color-lavender)]">TIENDA</span>
            </h2>
          </div>
          <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base max-w-xs leading-relaxed">
            Un espacio diseñado para ciclistas. Ven a conocernos, toca las
            bicis y habla con nuestro equipo.
          </p>
        </div>

        {/* Masonry fotos */}
        <style>{`
          .store-masonry { columns: 2; column-gap: 0.75rem; }
          @media (min-width: 768px) { .store-masonry { columns: 3; } }
          @media (min-width: 1024px) { .store-masonry { columns: 4; } }
        `}</style>
        <div className="rv store-masonry">
          {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
            <div key={n} className="mb-3 break-inside-avoid overflow-hidden rounded-xl">
              <img
                src={`/store/store-${n}.jpg`}
                alt={`DC Bikes tienda ${n}`}
                loading="lazy"
                className="w-full h-auto block hover:scale-105 transition-transform duration-500"
              />
            </div>
          ))}
        </div>

        {/* Grid de vídeos — F-08 (V5): controls obligatorio (WCAG 2.1.1) y
             autoplay sólo cuando NO se haya solicitado prefers-reduced-motion. */}
        <div className="rv mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <video
              key={n}
              src={`/store/store-video-${n}.mp4`}
              className="w-full rounded-xl object-cover"
              style={{ aspectRatio: '9/16', maxHeight: '520px' }}
              controls
              autoPlay={!prefersReducedMotion}
              muted
              loop={!prefersReducedMotion}
              playsInline
              preload="metadata"
            />
          ))}
        </div>
      </section>

      {quoteOpen && <QuoteModal productId={null} onClose={() => setQuoteOpen(false)} />}
    </div>
  )
}
