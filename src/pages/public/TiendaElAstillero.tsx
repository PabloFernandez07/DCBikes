import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, Clock, Wrench, ShoppingBag, Users, Phone, Bike } from 'lucide-react'
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
    question: '¿Dónde está la tienda de bicicletas en El Astillero?',
    answer:
      'Estamos en El Astillero, Cantabria (CP 39610), en plena Bahía de Santander. Puedes ver el mapa exacto y cómo llegar en nuestra página de contacto. Disponemos de tienda física donde podrás ver y probar las bicicletas antes de comprarlas.',
  },
  {
    question: '¿Qué marcas de bicicletas vendéis en El Astillero?',
    answer:
      'Somos distribuidores oficiales de Giant, Liv y Stevens. Trabajamos con bicicletas de carretera, montaña, gravel, urbanas y eléctricas, además de componentes, accesorios y equipación para ciclistas de todos los niveles.',
  },
  {
    question: '¿Cuál es el horario de la tienda?',
    answer:
      'Abrimos de lunes a viernes de 9:30 a 13:30 y de 16:30 a 20:00. Puedes pasarte sin cita para ver el catálogo o llamarnos al +34 942 05 45 01 si quieres asegurarte de la disponibilidad de un modelo concreto.',
  },
  {
    question: '¿Puedo recoger mi pedido online en la tienda de El Astillero?',
    answer:
      'Sí. Puedes comprar en nuestro catálogo online y elegir recogida en tienda, así te ahorras gastos de envío y revisas el producto con nosotros antes de llevártelo. También resolvemos cualquier duda sobre el montaje en el momento.',
  },
  {
    question: '¿Tenéis taller propio en El Astillero?',
    answer:
      'Sí, contamos con taller propio en la misma tienda. Reparamos y ponemos a punto bicicletas de cualquier marca, no solo las que vendemos. Puedes consultar todos los servicios en nuestra página de taller.',
  },
  {
    question: '¿Me asesoráis para elegir la bicicleta adecuada?',
    answer:
      'Por supuesto. Te ayudamos a elegir la bicicleta y la talla que mejor se adapta a tu altura, tu disciplina y tu presupuesto. Preferimos que vengas a la tienda para aconsejarte de forma personalizada y que pruebes la bici antes de decidir.',
  },
]

export default function TiendaElAstillero() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Tienda de bicicletas en El Astillero"
        description="Tu tienda de bicicletas en El Astillero, Cantabria. Venta oficial Giant, Liv y Stevens, taller propio, asesoramiento y recogida en tienda. Pásate a vernos."
        url="https://dcbikescantabria.com/tienda-bicicletas-el-astillero"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Tienda en El Astillero', url: 'https://dcbikescantabria.com/tienda-bicicletas-el-astillero' },
        ]}
        jsonLd={faqJsonLd(faqs)}
      />

      {/* Hero */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 20% 50%, rgba(196,162,207,0.07) 0%, transparent 70%)' }}
        />
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[18vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none"
          aria-hidden="true"
        >
          ASTILLERO
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            El Astillero · Cantabria
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-[var(--color-cream)] tracking-wide leading-none">
            TIENDA DE<br />
            BICICLETAS EN<br />
            <span className="text-[var(--color-lavender)]">EL ASTILLERO</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            DC Bikes es tu tienda de bicicletas de barrio en El Astillero. Venta oficial de Giant, Liv
            y Stevens, taller propio y asesoramiento cercano. Ven a tocar las bicis y habla con quien
            de verdad entiende.
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

      {/* Intro: tu tienda de barrio */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv max-w-3xl">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Tu tienda de barrio
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide mb-6">
              CICLISMO HECHO EN EL ASTILLERO
            </h2>
            <div className="space-y-5 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              <p>
                En El Astillero, a un paso de la Bahía de Santander, encontrarás mucho más que una tienda
                de bicicletas. DC Bikes nació para acercar el buen ciclismo a Cantabria con la cercanía de
                un comercio de barrio y el respaldo de las mejores marcas del mercado. Aquí no eres un número:
                te conocemos, conocemos tu bici y sabemos qué necesitas para disfrutar de cada salida.
              </p>
              <p>
                Tanto si buscas tu primera bicicleta urbana para moverte por El Astillero como si quieres dar
                el salto a una bici de carretera, una eléctrica para llegar al trabajo o una montaña para los
                montes de la zona, te asesoramos sin prisas y sin tecnicismos. Puedes ver y probar los modelos
                en la tienda, comparar tallas y resolver todas tus dudas antes de decidir, algo que ninguna
                compra online te puede ofrecer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Qué ofrecemos */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Qué ofrecemos
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              TODO LO QUE NECESITAS,<br />EN UN MISMO SITIO
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: <ShoppingBag size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Venta oficial', text: 'Distribuidores oficiales de Giant, Liv y Stevens. Carretera, montaña, gravel, urbanas y eléctricas con garantía de marca.' },
              { icon: <Wrench size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Taller propio', text: 'Reparación y mantenimiento de cualquier marca en nuestro taller de El Astillero. Diagnóstico antes de empezar.' },
              { icon: <Users size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Asesoramiento', text: 'Te ayudamos a elegir bici, talla y componentes según tu uso, tu altura y tu presupuesto. Cara a cara.' },
              { icon: <ShoppingBag size={26} strokeWidth={1.5} aria-hidden="true" />, title: 'Recogida en tienda', text: 'Compra online y recoge en la tienda sin gastos de envío. Revisamos el producto contigo antes de llevártelo.' },
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

      {/* Cómo llegar + horario */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid lg:grid-cols-2 gap-6">
            <div className="p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-12 h-12 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center mb-5">
                <MapPin size={22} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </div>
              <h2 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                CÓMO LLEGAR
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed mb-5">
                Estamos en El Astillero (Cantabria, CP 39610), en plena Bahía de Santander y muy bien
                comunicados por la autovía y la red de cercanías. Tienes la ubicación exacta, el mapa y
                las indicaciones para llegar en nuestra página de contacto.
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
                Abrimos de lunes a viernes para que puedas pasarte a ver el catálogo, dejar tu bici en el
                taller o pedir consejo sin compromiso.
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
        title="DUDAS SOBRE LA TIENDA"
        subtitle="Lo que más nos preguntan los ciclistas de El Astillero y alrededores."
      />

      {/* Interlinking */}
      <section className="pb-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { to: '/taller', icon: <Wrench size={20} aria-hidden="true" />, title: 'Taller de bicicletas', text: 'Reparación y mantenimiento de cualquier marca.' },
              { to: '/tienda-bicicletas-santander', icon: <Bike size={20} aria-hidden="true" />, title: 'Tienda desde Santander', text: 'A 10 minutos de Santander. Merece la pena acercarse.' },
              { to: '/preguntas-frecuentes', icon: <Users size={20} aria-hidden="true" />, title: 'Preguntas frecuentes', text: 'Resolvemos todas tus dudas sobre la tienda.' },
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
                VEN A VERNOS
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed max-w-md">
                Pásate por la tienda de El Astillero o escríbenos. Te atendemos con mucho gusto.
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
                  Contactar
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
