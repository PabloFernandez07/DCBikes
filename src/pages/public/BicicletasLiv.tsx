import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mountain, Bike, Zap, MapPin, Ruler, ShieldCheck, Wrench, Heart, ArrowRight, Phone, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { FaqSection, faqJsonLd, type FaqItem } from '@/components/public/FaqSection'
import { StoreContactStrip } from '@/components/public/StoreContactStrip'

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
    icon: <Mountain size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Montaña (MTB)',
    text: 'Modelos como Pique, Embolden o Tempt llevan la geometría femenina al monte: cuadros equilibrados, suspensión calibrada para pesos y reparto de carga distintos, y contacto pensado para manos más pequeñas.',
  },
  {
    icon: <Bike size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Carretera',
    text: 'Las gamas Langma y Avail ofrecen rigidez y comodidad en proporciones diseñadas para la mujer, ya busques rendimiento en competición o kilómetros cómodos de fondo.',
  },
  {
    icon: <Zap size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Eléctricas (E-bikes)',
    text: 'Las eléctricas Liv, con motor SyncDrive, hacen accesibles las rutas más largas y las cuestas de Cantabria, manteniendo siempre el ajuste y la ergonomía específicos de la marca.',
  },
  {
    icon: <Bike size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Urbana y paseo',
    text: 'Bicicletas cómodas y versátiles para el día a día, los desplazamientos urbanos o los paseos por la bahía, con la misma filosofía de ajuste pensada para ellas.',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Distribuidor oficial Liv', text: 'Vendemos Liv con garantía oficial. Catálogo completo, recambios originales y el respaldo del fabricante detrás de cada bicicleta.' },
  { icon: <Heart size={16} aria-hidden="true" />, title: 'Asesoramiento personalizado', text: 'Te escuchamos para entender cómo y dónde vas a rodar, y te recomendamos el modelo Liv que mejor encaja con tu cuerpo y tus objetivos.' },
  { icon: <Ruler size={16} aria-hidden="true" />, title: 'Tallaje y ajuste femenino', text: 'Acertar con la talla en una Liv es aún más importante: ajustamos altura, alcance y contacto para que la bici se sienta como una extensión de ti.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller propio en El Astillero', text: 'Mantenimiento, puesta a punto y reparación a cargo de nuestros mecánicos, sin que tengas que salir de Cantabria.' },
]

const faqs: FaqItem[] = [
  {
    question: '¿Qué hace diferentes a las bicicletas Liv?',
    answer: 'Liv es la primera marca global de ciclismo diseñada exclusivamente para mujeres. No son bicicletas "unisex pintadas de otro color": parten de geometrías, puntos de contacto (sillín, manetas, anchura de manillar) y ajustes desarrollados específicamente a partir de datos de cuerpos femeninos.',
  },
  {
    question: '¿Es DC Bikes distribuidor oficial de Liv en Cantabria?',
    answer: 'Sí. En DC Bikes Cantabria, en El Astillero, somos distribuidor oficial de Liv. Vendemos los modelos con garantía de fábrica, recambios originales y el soporte directo de la marca.',
  },
  {
    question: '¿Por qué una bicicleta específica para mujer y no una talla pequeña?',
    answer: 'Una talla pequeña de una bici masculina reduce el tamaño, pero no cambia las proporciones ni el contacto. Liv ajusta la geometría, la rigidez del cuadro, la suspensión y los componentes a las diferencias reales de altura, alcance y reparto de peso, lo que se traduce en más comodidad y mejor control.',
  },
  {
    question: '¿Qué gama de Liv puedo encontrar?',
    answer: 'Trabajamos montaña, carretera, gravel, urbana y eléctricas Liv. Puedes consultar la disponibilidad concreta en nuestro catálogo o pasarte por la tienda para verlas en persona.',
  },
  {
    question: '¿Me ayudáis a elegir el modelo y la talla correctos?',
    answer: 'Por supuesto. Nuestro asesoramiento personalizado tiene muy en cuenta tu altura, tu alcance y el uso que le vas a dar. En una Liv, el ajuste fino marca una gran diferencia en la experiencia.',
  },
  {
    question: '¿Tenéis taller para el mantenimiento de mi Liv?',
    answer: 'Sí. Contamos con taller propio y mecánicos especializados en El Astillero. Nos ocupamos del mantenimiento, las revisiones y las reparaciones de tu Liv, incluidas las eléctricas. Puedes ver los servicios en la página de taller.',
  },
]

export default function BicicletasLiv() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas Liv en Cantabria — Distribuidor Oficial"
        description="Bicicletas Liv en El Astillero, Cantabria. La marca diseñada exclusivamente para mujeres: montaña, carretera y eléctricas. Asesoramiento y taller en DC Bikes."
        url="https://dcbikescantabria.com/bicicletas-liv"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas Liv', url: 'https://dcbikescantabria.com/bicicletas-liv' },
        ]}
        jsonLd={faqJsonLd(faqs)}
      />

      {/* Hero */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 20% 50%, rgba(196,162,207,0.09) 0%, transparent 70%)' }}
        />
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[20vw] leading-none text-[rgba(196,162,207,0.04)] select-none pointer-events-none"
          aria-hidden="true"
        >
          LIV
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Ciclismo diseñado para mujeres
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS LIV<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            La primera marca global de ciclismo creada exclusivamente para la mujer. Geometría, contacto y ajuste
            específicos, con distribución oficial, asesoramiento personalizado y taller propio en El Astillero.
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

      {/* Intro: por qué Liv */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv max-w-3xl">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              La marca
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide mb-6">
              PENSADA POR Y PARA MUJERES
            </h2>
            <div className="space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              <p>
                Liv es la única marca global de ciclismo dedicada por completo a la mujer. No adapta modelos existentes:
                diseña cada bicicleta desde cero a partir de datos de miles de ciclistas femeninas. Geometría, rigidez
                del cuadro, ajuste de la suspensión y puntos de contacto se calibran para las diferencias reales de
                altura, alcance, flexibilidad y reparto de peso, no para una media masculina.
              </p>
              <p>
                El resultado es una bicicleta que se siente cómoda desde el primer pedaleo y que ofrece más control y
                confianza. Una ciclista bien ajustada disfruta más, rinde más y se cansa menos. Por eso Liv no es solo
                cuestión de talla, sino de un concepto distinto de ajuste integral que abarca toda la gama.
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
              Gama Liv
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              UNA LIV PARA CADA RUTA
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
              TU LIV, CON EL AJUSTE PERFECTO
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
            <Link to="/bicicletas-stevens" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Bicicletas Stevens</Link>
            <span className="text-[var(--color-mid)]">·</span>
            <Link to="/taller" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Nuestro taller</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="PREGUNTAS SOBRE LIV"
        subtitle="Resolvemos las dudas más habituales sobre las bicicletas Liv y por qué están diseñadas específicamente para mujeres."
      />

      <StoreContactStrip />

      {/* CTA final */}
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
              LIV
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                ENCUENTRA TU LIV
              </h2>
              <div className="flex items-center gap-2 text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide justify-center md:justify-start">
                <MapPin size={14} className="text-[var(--color-lavender)]" aria-hidden="true" />
                Te asesoramos en El Astillero, Cantabria
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
