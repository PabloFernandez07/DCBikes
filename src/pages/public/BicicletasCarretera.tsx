import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Feather, Trophy, Route, Wrench, ArrowRight, CheckCircle, ShieldCheck, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { FaqSection, faqJsonLd } from '@/components/public/FaqSection'

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

const focuses = [
  {
    icon: <Route size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Endurance',
    text: 'Geometría más cómoda y estable para rutas largas y muchas horas sobre la bici. Prioriza el confort y el aplomo sin renunciar a un buen rendimiento. La elección para disfrutar kilómetros.',
    accent: 'from-[rgba(196,162,207,0.15)] to-transparent',
  },
  {
    icon: <Trophy size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Competición',
    text: 'Posición más agresiva y reactiva, pensada para el ritmo alto y la respuesta inmediata. Cada vatio cuenta. Para quien busca velocidad, agilidad y exprimir su rendimiento.',
    accent: 'from-[rgba(229,48,30,0.08)] to-transparent',
  },
  {
    icon: <Feather size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Gravel',
    text: 'El puente entre asfalto y caminos: neumáticos más anchos y geometría versátil para salir de la carretera. Si te tientan las pistas y la aventura, es una opción muy polivalente.',
    accent: 'from-[rgba(196,162,207,0.1)] to-transparent',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Oficiales Giant, Liv y Stevens', text: 'Distribuidores oficiales: gamas de carretera con garantía de marca, repuestos originales y soporte de fabricante.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller con mecánicos', text: 'Montaje, ajuste de transmisión y puesta a punto para que tu road rinda kilómetro tras kilómetro.' },
  { icon: <CheckCircle size={16} aria-hidden="true" />, title: 'Asesoramiento honesto', text: 'Aluminio o carbono, endurance o competición: te orientamos según tu uso real y tu presupuesto.' },
  { icon: <MapPin size={16} aria-hidden="true" />, title: 'En El Astillero', text: 'Ven a ver modelos y comprobar tallas en persona. Estamos en El Astillero, Cantabria.' },
]

const faqs = [
  {
    question: '¿Aluminio o carbono?',
    answer: 'Un cuadro de aluminio ofrece una excelente relación prestaciones-precio, es resistente y una entrada estupenda a la carretera. El carbono permite cuadros más ligeros y un comportamiento muy afinado, con un precio superior. Para muchos ciclistas el aluminio cumple de sobra; el carbono tiene sentido si buscas el máximo rendimiento o vas a competir. Te ayudamos a decidir según tu uso y presupuesto.',
  },
  {
    question: '¿Endurance o competición?',
    answer: 'Una bici endurance tiene una geometría más cómoda y estable, pensada para rutas largas y muchas horas sobre la bici. Una de competición adopta una posición más agresiva y reactiva, orientada al ritmo alto y la respuesta inmediata. Si ruedas por placer y haces salidas largas, la endurance suele encajar mejor; si buscas velocidad y rendimiento, la competición es tu terreno.',
  },
  {
    question: '¿Qué es una bicicleta de gravel?',
    answer: 'El gravel es el puente entre la carretera y los caminos: monta neumáticos más anchos y una geometría más versátil que te permite salir del asfalto hacia pistas y sendas. Es una opción muy polivalente si te tienta combinar carretera y aventura sin tener dos bicis distintas. En tienda te contamos si encaja con lo que buscas.',
  },
  {
    question: '¿Por qué es tan importante el tallaje y el ajuste?',
    answer: 'En carretera pasas muchas horas en la misma postura, así que una talla correcta y un buen ajuste marcan la diferencia entre disfrutar o sufrir: afectan a la comodidad, a la eficacia del pedaleo y a prevenir molestias. Por eso conviene no fiarse solo de una tabla de tallas. En El Astillero comprobamos tus medidas y te orientamos hacia la talla y posición adecuadas.',
  },
  {
    question: '¿Qué marcas de bicicletas de carretera tenéis?',
    answer: 'Somos distribuidores oficiales de Giant, Liv y Stevens, con gamas de carretera para distintos enfoques y niveles. Al ser oficiales te ofrecemos garantía de marca, repuestos originales y el respaldo del fabricante.',
  },
  {
    question: '¿Hacéis mantenimiento de bicicletas de carretera?',
    answer: 'Sí. En nuestro taller con mecánicos realizamos montaje, ajuste de cambios y frenos, sustitución de cables y fundas y la puesta a punto general para que tu bici de carretera rinda kilómetro tras kilómetro. Puedes consultar el servicio de taller o acercarte a vernos.',
  },
]

export default function BicicletasCarretera() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas de carretera en Cantabria"
        description="Bicicletas de carretera en Cantabria: aluminio o carbono, endurance, competición y gravel. En DC Bikes, El Astillero. Oficiales Giant, Liv y Stevens, taller y asesoramiento."
        url="https://dcbikescantabria.com/bicicletas-carretera"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas de carretera', url: 'https://dcbikescantabria.com/bicicletas-carretera' },
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
          ROAD
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Carretera · Road · Gravel
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-6xl md:text-7xl lg:text-[8rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS DE CARRETERA<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Aluminio o carbono, endurance o competición, con un guiño al gravel. En DC Bikes, El Astillero,
            te ayudamos a elegir la road que encaja con tu forma de rodar y con tu presupuesto.
          </p>
          <div className="rv flex flex-wrap gap-4 mt-10" style={{ transitionDelay: '180ms' }}>
            <Link to="/catalogo">
              <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-lg">
                Ver catálogo
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/contacto">
              <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide">
                Pide asesoramiento
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Aluminio vs carbono */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              El cuadro
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              ALUMINIO O CARBONO
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              El <strong className="text-[var(--color-cream)]">aluminio</strong> ofrece una relación
              prestaciones-precio excelente: es resistente, fiable y una entrada estupenda al mundo de la carretera.
              Para la mayoría de ciclistas que ruedan por placer y forma, cumple de sobra.
            </p>
            <p>
              El <strong className="text-[var(--color-cream)]">carbono</strong> permite cuadros más ligeros y un
              comportamiento más afinado, a cambio de un precio superior. Tiene sentido si buscas el máximo rendimiento o
              piensas competir. No hay una respuesta única: depende de tu uso, tus objetivos y tu presupuesto, y eso es
              justo lo que valoramos contigo en tienda.
            </p>
          </div>
        </div>
      </section>

      {/* Enfoques */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Enfoques
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              ENDURANCE, COMPETICIÓN Y GRAVEL
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {focuses.map(({ icon, title, text, accent }, i) => (
              <div
                key={title}
                className="rv group relative p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-mid)]/10 hover:border-[rgba(196,162,207,0.3)] transition-all duration-300 overflow-hidden"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                <div className="relative">
                  <div className="text-[var(--color-lavender)] mb-5 w-14 h-14 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center">
                    {icon}
                  </div>
                  <h3 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                    {title}
                  </h3>
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tallaje y ajuste */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Tallaje y ajuste
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              EL AJUSTE LO ES TODO
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              En carretera pasas muchas horas en la misma postura, así que la <strong className="text-[var(--color-cream)]">talla
              y el ajuste</strong> marcan la diferencia entre disfrutar o terminar con molestias. Una posición correcta mejora la
              comodidad, la eficacia del pedaleo y previene problemas a largo plazo.
            </p>
            <p>
              Por eso recomendamos no fiarse solo de una tabla de tallas. En El Astillero comprobamos tus medidas y te orientamos
              hacia la posición adecuada, y en nuestro{' '}
              <Link to="/taller" className="text-[var(--color-lavender)] underline underline-offset-2">taller con mecánicos</Link>{' '}
              dejamos la bici a punto para que cada salida sume.
            </p>
          </div>
        </div>
      </section>

      {/* Por qué DC Bikes */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Por qué en DC Bikes
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              KILÓMETROS CON CRITERIO
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {reasons.map(({ icon, title, text }, i) => (
              <div
                key={title}
                className="rv flex flex-col gap-3 p-6 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="w-9 h-9 rounded-lg bg-[rgba(196,162,207,0.12)] flex items-center justify-center shrink-0 text-[var(--color-lavender)]">
                  {icon}
                </div>
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">{title}</p>
                <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
              </div>
            ))}
          </div>
          <p className="rv mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            ¿Prefieres el monte o un empujón extra? Echa un vistazo a nuestras{' '}
            <Link to="/bicicletas-montana" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas de montaña
            </Link>{' '}
            y{' '}
            <Link to="/bicicletas-electricas" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas eléctricas
            </Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="DUDAS SOBRE CARRETERA"
        subtitle="Las preguntas más habituales antes de elegir tu bicicleta de carretera."
      />

      {/* CTA */}
      <section className="py-8 pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div
            className="rv rounded-3xl p-6 sm:p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(196,162,207,0.12) 0%, rgba(196,162,207,0.04) 100%)', border: '1px solid rgba(196,162,207,0.2)' }}
          >
            <div
              className="absolute right-0 bottom-0 font-[var(--font-display)] text-[18vw] leading-none text-[rgba(196,162,207,0.04)] select-none pointer-events-none"
              aria-hidden="true"
            >
              GO
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                A SUMAR KILÓMETROS
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm max-w-md">
                Cuéntanos cómo ruedas y te ayudamos a elegir tu road en El Astillero.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 relative shrink-0">
              <Link to="/catalogo">
                <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-xl w-full">
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
