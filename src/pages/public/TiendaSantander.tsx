import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Navigation, Clock, Wrench, ShieldCheck, HeartHandshake, Phone, Bike, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { FaqSection, faqJsonLd, type FaqItem } from '@/components/public/FaqSection'

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

const faqs: FaqItem[] = [
  {
    question: '¿A qué distancia está DC Bikes de Santander?',
    answer:
      'Estamos en El Astillero, a unos 10 minutos en coche del centro de Santander por la autovía, dentro de la propia Bahía de Santander. Para muchos ciclistas santanderinos es la tienda especializada más cómoda y cercana, con aparcamiento sencillo.',
  },
  {
    question: '¿Por qué acercarme desde Santander en lugar de comprar online?',
    answer:
      'En la tienda puedes ver y probar la bicicleta, comparar tallas en persona y recibir asesoramiento real antes de gastarte tu dinero. Además, tienes taller propio para el mantenimiento y una garantía oficial de marca con alguien a quien acudir. Eso una compra online no te lo da.',
  },
  {
    question: '¿Qué marcas oficiales puedo encontrar?',
    answer:
      'Somos distribuidores oficiales de Giant, Liv y Stevens, con bicicletas de carretera, montaña, gravel, urbanas y eléctricas. Al ser distribuidor oficial, tu bicicleta cuenta con la garantía completa de la marca y acceso a recambios originales.',
  },
  {
    question: '¿Cómo llego desde Santander a la tienda?',
    answer:
      'Desde Santander llegas en unos 10 minutos por la S-10 / A-8 en dirección a El Astillero. También puedes venir en cercanías. En nuestra página de contacto tienes el mapa y las indicaciones exactas para llegar.',
  },
  {
    question: '¿Puedo dejar mi bicicleta en el taller aunque viva en Santander?',
    answer:
      'Por supuesto. Atendemos a muchos clientes de Santander en el taller. Reparamos y ponemos a punto cualquier marca, hagamos vendido la bici o no. Te damos presupuesto antes de empezar y la mayoría de trabajos los resolvemos en 24-48 horas.',
  },
]

export default function TiendaSantander() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Tienda de bicicletas cerca de Santander"
        description="Tienda de bicicletas a 10 minutos de Santander, en El Astillero. Giant, Liv y Stevens oficiales, taller propio y trato cercano. Merece la pena acercarse."
        url="https://dcbikescantabria.com/tienda-bicicletas-santander"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Tienda cerca de Santander', url: 'https://dcbikescantabria.com/tienda-bicicletas-santander' },
        ]}
        jsonLd={faqJsonLd(faqs)}
      />

      {/* Hero */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 80% 50%, rgba(196,162,207,0.07) 0%, transparent 70%)' }}
        />
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[18vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none"
          aria-hidden="true"
        >
          SANTANDER
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            A 10 min de Santander
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-[var(--color-cream)] tracking-wide leading-none">
            TIENDA DE<br />
            BICICLETAS PARA<br />
            <span className="text-[var(--color-lavender)]">SANTANDER</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            A solo diez minutos del centro de Santander, en El Astillero, te espera una tienda
            especializada con marcas oficiales, taller propio y el trato cercano que se ha perdido
            en las grandes superficies y las webs sin cara.
          </p>
          <div className="rv flex flex-wrap gap-4 mt-10" style={{ transitionDelay: '180ms' }}>
            <Link to="/catalogo">
              <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-lg">
                Ver catálogo
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </Link>
            <a href="tel:+34942054501">
              <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide">
                <Phone size={16} aria-hidden="true" />
                942 05 45 01
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Por qué acercarse desde Santander */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv max-w-3xl">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Merece la pena el viaje
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide mb-6">
              TAN CERCA QUE NO ES EXCUSA
            </h2>
            <div className="space-y-5 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              <p>
                Vives en Santander y buscas una bicicleta seria, no un capricho de gran superficie.
                A diez minutos de tu casa, en El Astillero, tienes una tienda donde cada bici se elige
                pensando en ti: te preguntan cómo vas a usarla, te miden la talla y te dejan probarla.
                Es la diferencia entre comprar una bicicleta y comprar la bicicleta correcta.
              </p>
              <p>
                Comprar online parece cómodo hasta que la bici llega mal montada, la talla no encaja o
                necesitas una garantía y no encuentras a quién acudir. En DC Bikes trabajamos solo con
                marcas oficiales —Giant, Liv y Stevens—, montamos cada bicicleta con criterio y, cuando
                necesite mantenimiento, tienes el taller en el mismo sitio donde la compraste. Para muchos
                ciclistas de Santander, ese respaldo vale mucho más que ahorrarse el desplazamiento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Razones */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Por qué DC Bikes
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              LO QUE GANAS<br />VINIENDO DESDE SANTANDER
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: <ShieldCheck size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Marcas oficiales', text: 'Distribuidor oficial de Giant, Liv y Stevens. Garantía completa de marca y recambios originales.' },
              { icon: <Wrench size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Taller propio', text: 'Mantenimiento y reparación de cualquier marca a diez minutos de casa, no a un envío de distancia.' },
              { icon: <HeartHandshake size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Trato cercano', text: 'Asesoramiento real y sin prisas. Pruebas la bici, comparas tallas y decides con criterio.' },
              { icon: <Navigation size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'A un paso', text: 'En la Bahía de Santander, a 10 minutos por autovía. Fácil de llegar y de aparcar.' },
            ].map(({ icon, title, text }, i) => (
              <div
                key={title}
                className="rv group relative p-6 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.3)] transition-all duration-300"
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <div className="text-[var(--color-lavender)] mb-4 w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center">
                  {icon}
                </div>
                <h3 className="font-[var(--font-cond)] text-xl font-semibold text-[var(--color-cream)] tracking-wide mb-2">
                  {title}
                </h3>
                <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo llegar desde Santander + horario */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid lg:grid-cols-2 gap-6">
            <div className="p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center mb-5">
                <Navigation size={22} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </div>
              <h2 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                CÓMO LLEGAR DESDE SANTANDER
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed mb-5">
                Desde el centro de Santander, toma la S-10 / A-8 en dirección a El Astillero: en unos
                10 minutos estás en la puerta. También puedes venir en tren de cercanías. Tienes el mapa
                y las indicaciones exactas en nuestra página de contacto.
              </p>
              <Link
                to="/contacto"
                className="inline-flex items-center gap-2 font-[var(--font-cond)] text-[var(--color-lavender)] hover:underline tracking-wide"
              >
                Ver ubicación y mapa
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>

            <div className="p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center mb-5">
                <Clock size={22} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </div>
              <h2 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                HORARIO
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed mb-4">
                Planifica tu visita desde Santander: abrimos de lunes a viernes, mañana y tarde.
              </p>
              <ul className="space-y-2 font-[var(--font-body)] text-sm">
                <li className="flex items-baseline gap-3">
                  <span className="w-32 font-[var(--font-cond)] tracking-wide text-[var(--color-lavender)] shrink-0">Lunes a viernes</span>
                  <span className="text-[var(--color-cream)]">9:30–13:30 · 16:30–20:00</span>
                </li>
                <li className="flex items-baseline gap-3">
                  <span className="w-32 font-[var(--font-cond)] tracking-wide text-[var(--color-mid)] shrink-0">Sábado y domingo</span>
                  <span className="text-[var(--color-mid)]">Cerrado</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="DUDAS DESDE SANTANDER"
        subtitle="Lo que nos preguntan los ciclistas de Santander antes de acercarse."
      />

      {/* Interlinking */}
      <section className="pb-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { to: '/tienda-bicicletas-el-astillero', icon: <Bike size={20} aria-hidden="true" />, title: 'Tienda en El Astillero', text: 'Conoce tu tienda de bicicletas de barrio.' },
              { to: '/taller', icon: <Wrench size={20} aria-hidden="true" />, title: 'Taller de bicicletas', text: 'Reparación y mantenimiento de cualquier marca.' },
              { to: '/preguntas-frecuentes', icon: <HelpCircle size={20} aria-hidden="true" />, title: 'Preguntas frecuentes', text: 'Todas tus dudas resueltas antes de venir.' },
            ].map(({ to, icon, title, text }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-start gap-4 p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.3)] transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-[rgba(196,162,207,0.12)] flex items-center justify-center shrink-0 text-[var(--color-lavender)]">
                  {icon}
                </div>
                <div>
                  <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1 group-hover:text-[var(--color-lavender)] transition-colors">{title}</p>
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-8 pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div
            className="rv rounded-3xl p-6 sm:p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(196,162,207,0.12) 0%, rgba(196,162,207,0.04) 100%)', border: '1px solid rgba(196,162,207,0.2)' }}
          >
            <div
              className="absolute right-0 bottom-0 font-[var(--font-display)] text-[16vw] leading-none text-[rgba(196,162,207,0.04)] select-none pointer-events-none"
              aria-hidden="true"
            >
              GO
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                A 10 MIN DE TI
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed max-w-md">
                Acércate desde Santander y descubre la diferencia de comprar con asesoramiento real.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 relative shrink-0">
              <Link to="/catalogo">
                <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-lg w-full">
                  Ver catálogo
                  <ArrowRight size={20} aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/contacto">
                <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide w-full">
                  Cómo llegar
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
