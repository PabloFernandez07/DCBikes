import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mountain, Bike, Route, Trophy, MapPin, Ruler, ShieldCheck, Wrench, ArrowRight, Phone, CheckCircle } from 'lucide-react'
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

const ranges = [
  {
    icon: <Trophy size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Ciclocross',
    text: 'Stevens es una referencia histórica del ciclocross, con un palmarés de primer nivel en el circuito internacional. Cuadros reactivos y fiables, herederos directos de la competición.',
  },
  {
    icon: <Route size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Gravel',
    text: 'Bicicletas versátiles para caminos, pistas y aventuras mixtas. La experiencia de Stevens en ciclocross se traslada a un gravel capaz y divertido para explorar Cantabria.',
  },
  {
    icon: <Bike size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Carretera',
    text: 'Cuadros de carretera con la rigidez y la precisión de la ingeniería alemana, pensados tanto para el ciclista de fondo como para quien busca rendimiento en cada salida.',
  },
  {
    icon: <Mountain size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'MTB',
    text: 'Montaña sólida y bien construida para el trail y el cross-country, con la durabilidad y el cuidado por el detalle característicos de la marca de Hamburgo.',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Distribuidor oficial Stevens', text: 'Vendemos Stevens con garantía oficial. Acceso al catálogo, recambios y el respaldo del fabricante alemán detrás de cada bicicleta.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller propio especializado', text: 'Mecánicos con experiencia en cuadros de ciclocross, gravel y carretera. Montaje, mantenimiento y puesta a punto en El Astillero.' },
  { icon: <Ruler size={16} aria-hidden="true" />, title: 'Asesoramiento de tallaje', text: 'Te ayudamos a elegir la talla y geometría según tu disciplina y medidas. En ciclocross y gravel, el ajuste correcto es clave para el control.' },
  { icon: <MapPin size={16} aria-hidden="true" />, title: 'En El Astillero, Cantabria', text: 'Ven a verlas en persona, prueba la talla y resuelve tus dudas con un trato cercano antes y después de la compra.' },
]

const faqs: FaqItem[] = [
  {
    question: '¿Qué caracteriza a las bicicletas Stevens?',
    answer: 'Stevens es una marca alemana, con sede en Hamburgo, conocida por su ingeniería y su exigente control de calidad. Es especialmente fuerte en ciclocross, gravel, carretera y MTB, con cuadros que destacan por su rigidez, fiabilidad y cuidado en los detalles.',
  },
  {
    question: '¿DC Bikes es distribuidor oficial de Stevens en Cantabria?',
    answer: 'Sí. En DC Bikes Cantabria, en El Astillero, somos distribuidor oficial de Stevens. Vendemos los modelos con garantía de fábrica, recambios y el soporte directo del fabricante.',
  },
  {
    question: '¿Para qué tipo de ciclista encaja una Stevens?',
    answer: 'Encaja muy bien con quien busca calidad alemana y un comportamiento exigente: aficionados al ciclocross y al gravel, ciclistas de carretera que valoran la precisión, y quienes quieren una bici sólida y duradera para el monte. Si dudas, te asesoramos según tu uso.',
  },
  {
    question: '¿Por qué Stevens es referencia en ciclocross?',
    answer: 'Stevens lleva años compitiendo al máximo nivel en el circuito internacional de ciclocross, con un palmarés destacado. Esa experiencia en competición se traslada directamente a sus cuadros, que son reactivos, fiables y están afinados para terrenos exigentes.',
  },
  {
    question: '¿Qué gama de Stevens puedo encontrar?',
    answer: 'Trabajamos ciclocross, gravel, carretera y MTB de Stevens. La disponibilidad concreta puedes consultarla en nuestro catálogo o acercándote a la tienda para verlas y comparar modelos en persona.',
  },
  {
    question: '¿Tenéis taller para el mantenimiento de mi Stevens?',
    answer: 'Sí. Contamos con taller propio y mecánicos especializados en El Astillero, con experiencia en cuadros de ciclocross, gravel y carretera. Nos encargamos del montaje, las revisiones y las reparaciones. Puedes ver los servicios en la página de taller.',
  },
]

export default function BicicletasStevens() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas Stevens en Cantabria — Distribuidor Oficial"
        description="Bicicletas Stevens en El Astillero, Cantabria. Calidad alemana en ciclocross, gravel, carretera y MTB. Distribuidor oficial, taller propio y asesoramiento en DC Bikes."
        url="https://dcbikescantabria.com/bicicletas-stevens"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas Stevens', url: 'https://dcbikescantabria.com/bicicletas-stevens' },
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
          className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[16vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none"
          aria-hidden="true"
        >
          STEVENS
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Ingeniería alemana
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS STEVENS<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Calidad alemana de Hamburgo, fuerte en ciclocross, gravel, carretera y MTB. Distribución oficial,
            taller propio y asesoramiento de tallaje en El Astillero.
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
                <Phone size={16} aria-hidden="true" />
                Contactar
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Intro: por qué Stevens */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv max-w-3xl">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              La marca
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide mb-6">
              CALIDAD ALEMANA CON ADN DE COMPETICIÓN
            </h2>
            <div className="space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              <p>
                Stevens es una marca alemana con sede en Hamburgo y una larga trayectoria construyendo bicicletas
                deportivas. Su sello es la ingeniería: control de calidad exigente, geometrías afinadas y cuadros que
                priorizan la rigidez y la fiabilidad sin renunciar al confort. No es una marca masiva, sino una opción
                para quien valora el detalle y un comportamiento preciso.
              </p>
              <p>
                Donde Stevens brilla con luz propia es en el ciclocross: lleva años en lo más alto del circuito
                internacional, y esa herencia de competición se nota en toda su gama. De ahí da el salto natural al
                gravel, disciplina en la que su experiencia se traduce en bicicletas capaces y divertidas, además de
                contar con sólidas propuestas de carretera y MTB.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Gama */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Gama Stevens
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              DEL BARRO AL ASFALTO
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ranges.map(({ icon, title, text }, i) => (
              <div
                key={title}
                className="rv group relative p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-mid)]/10 hover:border-[rgba(196,162,207,0.3)] transition-all duration-300"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="text-[var(--color-lavender)] mb-5 w-14 h-14 rounded-xl bg-[rgba(196,162,207,0.1)] flex items-center justify-center">
                  {icon}
                </div>
                <h3 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide mb-3">
                  {title}
                </h3>
                <p className="text-[var(--color-mid)] text-sm md:text-base leading-relaxed font-[var(--font-body)]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué comprarla en DC Bikes */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Por qué en DC Bikes
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              TU STEVENS, BIEN ASESORADA
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {reasons.map(({ icon, title, text }, i) => (
              <div
                key={title}
                className="rv flex gap-4 p-6 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="w-8 h-8 rounded-lg bg-[rgba(196,162,207,0.12)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-lavender)]">
                  {icon}
                </div>
                <div>
                  <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">{title}</p>
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Interlinking marcas */}
          <div className="rv mt-10 flex flex-wrap items-center gap-3 text-sm font-[var(--font-cond)] tracking-wide">
            <span className="text-[var(--color-mid)] uppercase text-xs tracking-widest">Otras marcas oficiales:</span>
            <Link to="/bicicletas-giant" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Bicicletas Giant</Link>
            <span className="text-[var(--color-mid)]">·</span>
            <Link to="/bicicletas-liv" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Bicicletas Liv</Link>
            <span className="text-[var(--color-mid)]">·</span>
            <Link to="/taller" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Nuestro taller</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="PREGUNTAS SOBRE STEVENS"
        subtitle="Lo esencial sobre las bicicletas Stevens, su calidad alemana y para qué ciclista encajan mejor."
      />

      {/* CTA final */}
      <section className="py-8 pb-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div
            className="rv rounded-3xl p-6 sm:p-10 md:p-16 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(196,162,207,0.12) 0%, rgba(196,162,207,0.04) 100%)', border: '1px solid rgba(196,162,207,0.2)' }}
          >
            <div
              className="absolute right-0 bottom-0 font-[var(--font-display)] text-[14vw] leading-none text-[rgba(196,162,207,0.04)] select-none pointer-events-none"
              aria-hidden="true"
            >
              GO
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                DESCUBRE STEVENS
              </h2>
              <div className="flex items-center gap-2 text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide justify-center md:justify-start">
                <MapPin size={14} className="text-[var(--color-lavender)]" aria-hidden="true" />
                Te esperamos en El Astillero, Cantabria
              </div>
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
                  <CheckCircle size={16} aria-hidden="true" />
                  Pedir asesoramiento
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
