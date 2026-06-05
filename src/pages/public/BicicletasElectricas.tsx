import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Battery, Bike, Wrench, ArrowRight, CheckCircle, ShieldCheck, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { FaqSection, faqJsonLd } from '@/components/public/FaqSection'
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

const profiles = [
  {
    icon: <Bike size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Urbana y commuter',
    text: 'Para moverte por la ciudad y llegar al trabajo sin sudar ni depender del aparcamiento. La asistencia suaviza las cuestas y los semáforos, y llegas fresco a tu destino.',
    accent: 'from-[rgba(196,162,207,0.15)] to-transparent',
  },
  {
    icon: <Battery size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Trekking y paseo',
    text: 'Posición cómoda y autonomía amplia para rutas largas por carriles bici, sendas y entornos de Cantabria. Ideal si quieres ampliar distancias sin renunciar a la comodidad.',
    accent: 'from-[rgba(229,48,30,0.08)] to-transparent',
  },
  {
    icon: <Zap size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'eMTB (montaña eléctrica)',
    text: 'La asistencia te ayuda a subir más y disfrutar más bajadas. Perfecta para iniciarte en la montaña o para alargar tus salidas. Combínala bien con tu nivel y terreno.',
    accent: 'from-[rgba(196,162,207,0.1)] to-transparent',
  },
]

const reasons = [
  { icon: <ShieldCheck size={16} aria-hidden="true" />, title: 'Oficiales Giant, Liv y Stevens', text: 'Distribuidores oficiales: garantía de marca, repuestos originales y soporte directo de fabricante para tu e-bike.' },
  { icon: <Wrench size={16} aria-hidden="true" />, title: 'Taller con mecánicos', text: 'Mantenimiento específico de bicicleta eléctrica: motor, batería, firmware y transmisión, en nuestro propio taller.' },
  { icon: <CheckCircle size={16} aria-hidden="true" />, title: 'Asesoramiento honesto', text: 'Te ayudamos a elegir según tu uso real, tu recorrido y tu presupuesto. Sin venderte de más.' },
  { icon: <MapPin size={16} aria-hidden="true" />, title: 'En El Astillero', text: 'Pruébala en persona antes de decidir. Estamos en El Astillero, Cantabria, fáciles de visitar.' },
]

const faqs = [
  {
    question: '¿Qué es la asistencia al pedaleo?',
    answer: 'Una bicicleta eléctrica no es un ciclomotor: el motor solo te ayuda mientras pedaleas y se ajusta a varios niveles de potencia. Tú sigues marcando el ritmo; el motor multiplica tu esfuerzo y suaviza cuestas y arrancadas. La asistencia se corta a partir de cierta velocidad según la normativa, por lo que sigues necesitando pedalear.',
  },
  {
    question: '¿Por qué es importante probar la e-bike en tienda?',
    answer: 'El tacto del motor, la postura, el peso y la talla cambian mucho de un modelo a otro y son determinantes en una eléctrica. Probarla en persona en nuestra tienda de El Astillero te permite notar la asistencia real y acertar a la primera. Te recibimos sin compromiso para que la pruebes.',
  },
  {
    question: '¿Necesita un mantenimiento especial una bicicleta eléctrica?',
    answer: 'Comparte el mantenimiento habitual de cualquier bici (frenos, transmisión, ruedas) y añade el cuidado del sistema eléctrico: revisión del motor, salud de la batería, conexiones y actualizaciones de firmware. En nuestro taller con mecánicos realizamos el mantenimiento específico de e-bike para que rinda y dure.',
  },
  {
    question: '¿Qué marcas de bicicletas eléctricas tenéis?',
    answer: 'Somos distribuidores oficiales de Giant, Liv y Stevens, con gamas eléctricas urbanas, de trekking y de montaña. Al ser oficiales, te ofrecemos garantía de marca, repuestos originales y el respaldo del fabricante.',
  },
  {
    question: '¿Cuánto dura la batería?',
    answer: 'La autonomía depende del nivel de asistencia que uses, el terreno, tu peso, el viento y la presión de los neumáticos, así que cualquier cifra cerrada sería poco honesta. En tienda te explicamos cómo aprovechar mejor la batería y elegimos contigo la capacidad que encaja con tus rutas habituales.',
  },
  {
    question: '¿Me ayudáis a elegir el modelo adecuado?',
    answer: 'Sí. Te asesoramos según tu uso (ciudad, paseo o montaña), tu recorrido habitual y tu presupuesto, y te orientamos sobre talla y configuración. Puedes ver opciones en nuestro catálogo o pasarte por El Astillero para que te guiemos en persona.',
  },
]

export default function BicicletasElectricas() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Bicicletas eléctricas en Cantabria"
        description="Bicicletas eléctricas en Cantabria: urbanas, trekking y eMTB. Pruébalas en DC Bikes, El Astillero. Oficiales Giant, Liv y Stevens, taller y asesoramiento."
        url="https://dcbikescantabria.com/bicicletas-electricas"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Bicicletas eléctricas', url: 'https://dcbikescantabria.com/bicicletas-electricas' },
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
          E-BIKE
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Asistencia al pedaleo
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl sm:text-6xl md:text-7xl lg:text-[8rem] text-[var(--color-cream)] tracking-wide leading-none">
            BICICLETAS ELÉCTRICAS<br />
            <span className="text-[var(--color-lavender)]">EN CANTABRIA</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Una e-bike te ayuda a llegar más lejos, subir cuestas sin esfuerzo y disfrutar más del camino.
            En DC Bikes, El Astillero, te asesoramos para acertar y puedes probarla antes de decidir.
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
                Pruébala en tienda
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Intro: qué es */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Cómo funciona
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              MÁS LEJOS, CON MENOS ESFUERZO
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              Una bicicleta eléctrica integra un motor que <strong className="text-[var(--color-cream)]">solo te asiste cuando
              pedaleas</strong>. No conduces como en una moto: tú decides el ritmo y el motor multiplica tu esfuerzo en
              varios niveles, suavizando las cuestas, el viento y las arrancadas. Es la forma más cómoda de ampliar tus
              distancias y de moverte por la ciudad sin llegar sudando.
            </p>
            <p>
              Por eso es tan importante <strong className="text-[var(--color-cream)]">probarla en persona</strong>: el tacto
              del motor, el peso, la postura y la talla cambian mucho entre modelos. En nuestra tienda de El Astillero te la
              dejamos probar y te explicamos las diferencias sin compromiso, para que elijas con criterio.
            </p>
          </div>
        </div>
      </section>

      {/* Perfiles / para quién */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              ¿Para quién?
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              UNA E-BIKE PARA CADA USO
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {profiles.map(({ icon, title, text, accent }, i) => (
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

      {/* Mantenimiento e-bike */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8 max-w-3xl">
          <div className="rv mb-6">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Taller especializado
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              MANTENIMIENTO DE E-BIKE
            </h2>
          </div>
          <div className="rv space-y-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
            <p>
              Una eléctrica necesita el mantenimiento habitual de cualquier bici (frenos, transmisión, ruedas) y, además,
              el <strong className="text-[var(--color-cream)]">cuidado de su sistema eléctrico</strong>: revisión del motor,
              salud y conexiones de la batería y actualizaciones de firmware cuando corresponde. Hacerlo a tiempo alarga la
              vida del conjunto y mantiene la asistencia funcionando como el primer día.
            </p>
            <p>
              En nuestro <Link to="/taller" className="text-[var(--color-lavender)] underline underline-offset-2">taller con
              mecánicos</Link> realizamos este mantenimiento específico. Al ser oficiales Giant, Liv y Stevens trabajamos con
              repuestos originales y el respaldo del fabricante.
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
              TU E-BIKE, EN BUENAS MANOS
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
            ¿Buscas algo más específico? Descubre también nuestras{' '}
            <Link to="/bicicletas-montana" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas de montaña
            </Link>{' '}
            y{' '}
            <Link to="/bicicletas-carretera" className="text-[var(--color-lavender)] underline underline-offset-2">
              bicicletas de carretera
            </Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="DUDAS SOBRE BICIS ELÉCTRICAS"
        subtitle="Resolvemos las preguntas más habituales antes de dar el paso a una e-bike."
      />

      <StoreContactStrip />

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
                PRUEBA TU E-BIKE
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm max-w-md">
                Pásate por El Astillero, pruébala y te asesoramos sin compromiso.
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
