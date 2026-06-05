import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mountain, Activity, Gauge, Wrench, ArrowRight, CheckCircle, ShieldCheck, MapPin } from 'lucide-react'
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

const disciplines = [
  {
    icon: <Activity size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'XC (Cross Country)',
    text: 'Ligereza y eficiencia para pedalear rápido y subir bien. Recorridos de suspensión contenidos y geometría orientada al rendimiento. La opción de quien busca kilómetros y ritmo.',
    accent: 'from-[rgba(196,162,207,0.15)] to-transparent',
  },
  {
    icon: <Mountain size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Trail',
    text: 'El equilibrio más versátil: sube con soltura y baja con confianza. Geometría polivalente y recorrido medio para disfrutar de casi cualquier sendero. La más recomendable para empezar.',
    accent: 'from-[rgba(229,48,30,0.08)] to-transparent',
  },
  {
    icon: <Gauge size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Enduro',
    text: 'Pensada para bajadas exigentes y terreno técnico. Más recorrido de suspensión, geometría estable a alta velocidad y un plus de robustez. Para quien prioriza el descenso.',
    accent: 'from-[rgba(196,162,207,0.1)] to-transparent',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Oficiales Giant, Liv y Stevens', text: 'Distribuidores oficiales: gamas de MTB con garantía de marca, repuestos originales y soporte de fabricante.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller con mecánicos', text: 'Puesta a punto de suspensiones, transmisión y frenos para que tu MTB rinda en el monte.' },
  { icon: <CheckCircle size={16} aria-hidden="true" />, title: 'Asesoramiento honesto', text: 'Te orientamos según tu nivel, tus salidas y tu presupuesto. Sin venderte más bici de la que necesitas.' },
  { icon: <MapPin size={16} aria-hidden="true" />, title: 'En El Astillero', text: 'Ven a probar tallas y geometrías en persona. Estamos en El Astillero, Cantabria.' },
]

const faqs = [
  {
    question: '¿Rígida o doble suspensión?',
    answer: 'Una rígida (solo horquilla delantera) es más ligera, sencilla de mantener y económica, ideal para terreno menos roto y para iniciarte. Una doble suspensión añade amortiguación trasera, gana en confort, control y tracción en terreno técnico, a cambio de algo más de peso y mantenimiento. La elección depende de dónde y cómo vayas a rodar; en tienda lo valoramos contigo.',
  },
  {
    question: '¿Qué disciplina de MTB me conviene?',
    answer: 'Si buscas ritmo, kilómetros y subir bien, el XC encaja. Si quieres una bici para todo, que suba y baje con soltura, el trail es la opción más versátil y la más recomendable para empezar. Si lo tuyo son las bajadas técnicas, el enduro está pensado para ello. Te ayudamos a identificar tu perfil según el terreno que frecuentas.',
  },
  {
    question: '¿Cómo sé qué talla de bicicleta de montaña necesito?',
    answer: 'La talla depende de tu estatura, tu entrepierna y la geometría concreta de cada modelo, que varía entre marcas. Una talla correcta mejora el control, la comodidad y la seguridad. En nuestra tienda de El Astillero comprobamos tus medidas y te orientamos hacia la talla y geometría que mejor te encajan.',
  },
  {
    question: '¿Sirve la misma MTB para todos los terrenos de Cantabria?',
    answer: 'Cantabria ofrece terrenos muy variados, desde sendas suaves hasta tramos más técnicos y con desnivel. Una bici de trail polivalente cubre bien la mayoría de situaciones, pero si te centras en un tipo de uso concreto conviene afinar la elección. Cuéntanos por dónde sueles rodar y te recomendamos en consecuencia.',
  },
  {
    question: '¿Qué marcas de MTB tenéis?',
    answer: 'Somos distribuidores oficiales de Giant, Liv y Stevens, con gamas de montaña en distintas disciplinas y niveles. Al ser oficiales te ofrecemos garantía de marca, repuestos originales y el respaldo del fabricante.',
  },
  {
    question: '¿Hacéis mantenimiento de suspensiones y MTB?',
    answer: 'Sí. En nuestro taller con mecánicos ponemos a punto suspensiones, transmisión, frenos y ruedas, y revisamos el conjunto para que la bici responda en el monte. Puedes consultar el servicio de taller o pasarte a vernos.',
  },
]

export default function BicicletasMontana() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas de montaña (MTB) en Cantabria"
        description="Bicicletas de montaña y MTB en Cantabria: XC, trail y enduro, rígida o doble. En DC Bikes, El Astillero. Oficiales Giant, Liv y Stevens, taller y asesoramiento."
        url="https://dcbikescantabria.com/bicicletas-montana"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas de montaña', url: 'https://dcbikescantabria.com/bicicletas-montana' },
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
          MTB
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Montaña · MTB
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-6xl md:text-7xl lg:text-[8rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS DE MONTAÑA<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Del XC al enduro, rígida o doble suspensión. En DC Bikes, El Astillero, te ayudamos a elegir
            la MTB que encaja con tu nivel, tu talla y los terrenos donde sueles rodar.
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

      {/* Rígida vs doble */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Lo primero que decidir
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              RÍGIDA O DOBLE SUSPENSIÓN
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              Una <strong className="text-[var(--color-cream)]">rígida</strong> monta solo horquilla delantera: es más
              ligera, más sencilla de mantener y suele ser más económica. Es una gran puerta de entrada a la montaña y rinde
              muy bien en terrenos menos rotos y en rutas donde prima pedalear.
            </p>
            <p>
              Una <strong className="text-[var(--color-cream)]">doble suspensión</strong> añade amortiguación trasera, lo que
              se traduce en más confort, más control y mejor tracción cuando el terreno se complica. A cambio, pesa algo más y
              requiere un mantenimiento algo mayor. La decisión depende de dónde vayas a rodar y de tu nivel: lo valoramos
              contigo sin compromiso.
            </p>
          </div>
        </div>
      </section>

      {/* Disciplinas */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Disciplinas
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              XC, TRAIL Y ENDURO
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {disciplines.map(({ icon, title, text, accent }, i) => (
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

      {/* Tallaje y geometría */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Tallaje y geometría
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              LA TALLA LO CAMBIA TODO
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              En montaña, una talla correcta no es solo cuestión de comodidad: influye directamente en el{' '}
              <strong className="text-[var(--color-cream)]">control y la seguridad</strong> en bajada y en lo bien que pedaleas
              en subida. Y como la geometría varía entre marcas y modelos, dos bicis de la misma talla pueden sentarte de forma
              muy distinta.
            </p>
            <p>
              Por eso recomendamos no comprar solo por una tabla de medidas. En El Astillero comprobamos tus medidas, te
              explicamos cómo afecta la geometría a tu manejo y, en nuestro{' '}
              <Link to="/taller" className="text-[var(--color-lavender)] underline underline-offset-2">taller con mecánicos</Link>,
              afinamos los ajustes de tu MTB para que la sientas tuya desde el primer día.
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
              MONTAÑA CON CRITERIO
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
            ¿Te tira más el asfalto o quieres motor? Mira también nuestras{' '}
            <Link to="/bicicletas-carretera" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas de carretera
            </Link>{' '}
            y las{' '}
            <Link to="/bicicletas-electricas" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas eléctricas
            </Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="DUDAS SOBRE MTB"
        subtitle="Las preguntas más habituales antes de elegir tu bicicleta de montaña."
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
              MTB
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                AL MONTE
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm max-w-md">
                Cuéntanos cómo ruedas y te ayudamos a elegir tu MTB en El Astillero.
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
