import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mountain, Bike, Zap, MapPin, Ruler, ShieldCheck, Wrench, ArrowRight, Phone, CheckCircle } from 'lucide-react'
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
    icon: <Mountain size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Montaña (MTB)',
    text: 'Las series Trance, Stance, Fathom o Talon cubren desde el trail más exigente hasta la iniciación al monte. Cuadros ALUXX y Advanced Composite con suspensión Maestro propia de Giant.',
  },
  {
    icon: <Bike size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Carretera y gravel',
    text: 'La gama TCR, Defy y Propel marca la referencia en carretera, mientras que las Revolt llevan el espíritu Giant al gravel y las aventuras de larga distancia.',
  },
  {
    icon: <Zap size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Eléctricas (E-bikes)',
    text: 'Con el motor SyncDrive desarrollado junto a Yamaha, las gamas Explore E+, Trance X E+ y Fastroad E+ ofrecen una de las experiencias de pedaleo asistido más naturales del mercado.',
  },
  {
    icon: <Bike size={28} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Urbana y paseo',
    text: 'Modelos cómodos y duraderos para moverte por la ciudad o disfrutar del carril bici del Astillero y la bahía de Santander con la fiabilidad de la marca número uno.',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Distribuidor oficial Giant', text: 'Vendemos Giant con garantía oficial de fábrica. Acceso directo al catálogo, recambios originales y soporte del fabricante.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller propio especializado', text: 'Mecánicos con experiencia en sistemas Maestro, motores SyncDrive y grupos de toda la gama. Mantenimiento y puesta a punto en casa.' },
  { icon: <Ruler size={16} aria-hidden="true" />, title: 'Asesoramiento de tallaje', text: 'Te ayudamos a elegir la talla y geometría correcta según tu altura, alcance y tipo de uso. Una bici bien ajustada se disfruta el doble.' },
  { icon: <MapPin size={16} aria-hidden="true" />, title: 'En El Astillero, Cantabria', text: 'Tienda física donde puedes ver y tocar las bicicletas, resolver dudas en persona y recibir atención cercana antes y después de la compra.' },
]

const faqs: FaqItem[] = [
  {
    question: '¿DC Bikes es distribuidor oficial de Giant en Cantabria?',
    answer: 'Sí. En DC Bikes Cantabria, en El Astillero, somos distribuidor oficial de Giant. Eso significa que vendemos modelos con garantía de fábrica, recambios originales y el respaldo directo del fabricante.',
  },
  {
    question: '¿Qué tipos de bicicletas Giant puedo encontrar?',
    answer: 'Trabajamos toda la gama Giant: montaña (Trance, Fathom, Talon), carretera (TCR, Defy, Propel), gravel (Revolt), urbanas y eléctricas con motor SyncDrive. Lo mejor es pasarte por la tienda o consultar el catálogo para ver disponibilidad.',
  },
  {
    question: '¿Por qué elegir una bicicleta Giant?',
    answer: 'Giant es el mayor fabricante de bicicletas del mundo y produce sus propios cuadros, lo que se traduce en una excelente relación calidad-precio, tecnología contrastada y una gama muy completa para cualquier disciplina y nivel.',
  },
  {
    question: '¿Me ayudáis a elegir la talla correcta?',
    answer: 'Por supuesto. Nuestro asesoramiento de tallaje tiene en cuenta tu altura, tu alcance y el tipo de uso que vas a darle. Acertar con la talla y la geometría es clave para la comodidad y el rendimiento.',
  },
  {
    question: '¿Tenéis taller para el mantenimiento de mi Giant?',
    answer: 'Sí. Contamos con taller propio y mecánicos especializados en la tecnología Giant, incluidos los sistemas de suspensión Maestro y los motores eléctricos SyncDrive. Puedes consultar nuestros servicios en la página de taller.',
  },
  {
    question: '¿Puedo comprar una eléctrica Giant en El Astillero?',
    answer: 'Sí. Disponemos de e-bikes Giant de varias gamas. Ven a la tienda y te explicamos las diferencias entre los modelos para que elijas la asistencia y la autonomía que mejor encajan contigo.',
  },
]

export default function BicicletasGiant() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas Giant en Cantabria — Distribuidor Oficial"
        description="Bicicletas Giant en El Astillero, Cantabria. Distribuidor oficial: montaña, carretera, gravel y eléctricas. Taller propio y asesoramiento de tallaje en DC Bikes."
        url="https://dcbikescantabria.com/bicicletas-giant"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas Giant', url: 'https://dcbikescantabria.com/bicicletas-giant' },
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
          className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[20vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none"
          aria-hidden="true"
        >
          GIANT
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Distribuidor oficial
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS GIANT<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            La marca número uno del mundo, en El Astillero. Montaña, carretera, gravel y eléctricas Giant
            con garantía oficial, taller propio y asesoramiento de tallaje.
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

      {/* Intro: por qué Giant */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv max-w-3xl">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              La marca
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide mb-6">
              LA MAYOR FÁBRICA DE BICICLETAS DEL MUNDO
            </h2>
            <div className="space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              <p>
                Giant nació en Taiwán en 1972 y se ha convertido en el mayor fabricante de bicicletas del planeta.
                A diferencia de muchas marcas, Giant fabrica sus propios cuadros: domina todo el proceso, desde la
                tecnología del carbono hasta el ensamblaje final. Esa integración vertical es la razón de su famosa
                relación calidad-precio: obtienes prestaciones de gama alta a un precio más contenido que la competencia.
              </p>
              <p>
                Su catálogo es de los más amplios que existen. Tecnologías como el sistema de suspensión Maestro, los
                cuadros ALUXX en aluminio y Advanced Composite en carbono, o el motor SyncDrive desarrollado con Yamaha
                para las eléctricas, son referencia en el sector. Tanto si das tus primeras pedaladas como si compites,
                hay una Giant pensada para ti.
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
              Gama completa
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              UNA GIANT PARA CADA TERRENO
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
              TU GIANT, EN BUENAS MANOS
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
            <Link to="/bicicletas-liv" className="text-[var(--color-lavender)] hover:underline underline-offset-4">Bicicletas Liv</Link>
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
        title="PREGUNTAS SOBRE GIANT"
        subtitle="Todo lo que necesitas saber antes de elegir tu bicicleta Giant en DC Bikes Cantabria."
      />

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
              GO
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                ¿LISTO PARA TU GIANT?
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
