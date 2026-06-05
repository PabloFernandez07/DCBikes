import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Phone, MessageCircle, Bike, Wrench, MapPin } from 'lucide-react'
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
    question: '¿Qué marcas de bicicletas vendéis?',
    answer:
      'Somos distribuidores oficiales de Giant, Liv y Stevens. Tenemos bicicletas de carretera, montaña, gravel, urbanas y eléctricas, además de componentes, accesorios y equipación. Al ser distribuidor oficial, cada bicicleta cuenta con la garantía completa de la marca.',
  },
  {
    question: '¿Dónde está la tienda y cómo llego?',
    answer:
      'Estamos en El Astillero, Cantabria (CP 39610), en plena Bahía de Santander y a unos 10 minutos del centro de Santander por autovía. Tienes el mapa y las indicaciones exactas para llegar en nuestra página de contacto.',
  },
  {
    question: '¿Cuál es vuestro horario?',
    answer:
      'Abrimos de lunes a viernes de 9:30 a 13:30 y de 16:30 a 20:00. Los sábados y domingos permanecemos cerrados. Puedes pasarte sin cita o llamarnos al +34 942 05 45 01.',
  },
  {
    question: '¿Tenéis taller de reparaciones?',
    answer:
      'Sí, contamos con taller propio en la tienda. Reparamos y ponemos a punto bicicletas de cualquier marca, las hayas comprado con nosotros o no. Te damos presupuesto antes de empezar y la mayoría de los trabajos se resuelven en 24-48 horas. Puedes ver todos los servicios en nuestra página de taller.',
  },
  {
    question: '¿Vendéis bicicletas eléctricas?',
    answer:
      'Sí. Trabajamos con bicicletas eléctricas de Giant, Liv y Stevens, tanto urbanas como de montaña. Te asesoramos sobre autonomía, motor y uso para que elijas el modelo eléctrico que mejor se adapta a tus trayectos.',
  },
  {
    question: '¿Me ayudáis a elegir la talla correcta?',
    answer:
      'Por supuesto. El tallaje es clave para la comodidad y el rendimiento. Te asesoramos según tu altura, tu disciplina y tus medidas, y te recomendamos pasar por la tienda para ajustar la bicicleta y probarla antes de decidir.',
  },
  {
    question: '¿Puedo recoger mi pedido online en la tienda?',
    answer:
      'Sí. Al comprar en el catálogo online puedes elegir recogida en tienda, ahorrándote los gastos de envío. Revisamos el producto contigo en el momento de la entrega y resolvemos cualquier duda sobre su uso o montaje.',
  },
  {
    question: '¿Qué garantía tienen las bicicletas?',
    answer:
      'Las bicicletas nuevas cuentan con la garantía oficial del fabricante. Al ser distribuidores oficiales de Giant, Liv y Stevens, gestionamos la garantía directamente con la marca y tienes en nosotros un punto de referencia para cualquier incidencia.',
  },
  {
    question: '¿Cómo funcionan las devoluciones?',
    answer:
      'Si has comprado en la tienda online, dispones del derecho de desistimiento según la normativa vigente. Puedes consultar los plazos, condiciones y el procedimiento completo en nuestra página de devoluciones.',
  },
  {
    question: '¿Cómo pido un presupuesto?',
    answer:
      'Puedes pedir presupuesto de una reparación o de un montaje a través del formulario de nuestra página de contacto, por teléfono en el +34 942 05 45 01 o pasándote por la tienda. Te respondemos en menos de 24 horas.',
  },
  {
    question: '¿Qué formas de pago aceptáis?',
    answer:
      'Aceptamos los medios de pago habituales tanto en la tienda física como en la tienda online. Para los servicios de taller, el pago se realiza contra entrega al recoger la bicicleta. Si tienes una duda concreta sobre el pago, contáctanos y te lo explicamos.',
  },
  {
    question: '¿Reparáis bicicletas que no he comprado con vosotros?',
    answer:
      'Sí. En nuestro taller trabajamos con cualquier marca y modelo, sin importar dónde hayas comprado la bicicleta. Hacemos un diagnóstico y te damos presupuesto antes de empezar, sin sorpresas.',
  },
]

export default function PreguntasFrecuentes() {
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Preguntas frecuentes"
        description="Resolvemos tus dudas sobre DC Bikes Cantabria: marcas, ubicación en El Astillero, horarios, taller, bicicletas eléctricas, garantía, devoluciones y formas de pago."
        url="https://dcbikescantabria.com/preguntas-frecuentes"
        breadcrumbs={[
          { name: 'Inicio', url: 'https://dcbikescantabria.com' },
          { name: 'Preguntas frecuentes', url: 'https://dcbikescantabria.com/preguntas-frecuentes' },
        ]}
        jsonLd={faqJsonLd(faqs)}
      />

      {/* Hero */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(196,162,207,0.07) 0%, transparent 70%)' }}
        />
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[20vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none"
          aria-hidden="true"
        >
          FAQ
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-4">
            Resolvemos tus dudas
          </p>
          <h1 className="rv font-[var(--font-display)] text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] text-[var(--color-cream)] tracking-wide leading-none">
            PREGUNTAS<br />
            <span className="text-[var(--color-lavender)]">FRECUENTES</span>
          </h1>
          <p className="rv mt-6 md:mt-8 text-[var(--color-mid)] font-[var(--font-body)] text-lg md:text-xl max-w-2xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Todo lo que necesitas saber sobre DC Bikes: marcas, tienda en El Astillero, taller,
            garantía y mucho más. Si no encuentras tu respuesta, escríbenos.
          </p>
          <div className="rv flex flex-wrap gap-4 mt-10" style={{ transitionDelay: '180ms' }}>
            <Link to="/contacto">
              <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-lg">
                <MessageCircle size={18} aria-hidden="true" />
                Contactar
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

      {/* FAQ */}
      <FaqSection
        items={faqs}
        title="TODAS TUS DUDAS"
        subtitle="Marcas, ubicación, horarios, taller, garantía, devoluciones y pagos en un solo sitio."
      />

      {/* Enlaces útiles */}
      <section className="pb-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { to: '/tienda-bicicletas-el-astillero', icon: <MapPin size={20} aria-hidden="true" />, title: 'Tienda en El Astillero', text: 'Tu tienda de bicicletas de barrio en Cantabria.' },
              { to: '/tienda-bicicletas-santander', icon: <Bike size={20} aria-hidden="true" />, title: 'Tienda desde Santander', text: 'A 10 minutos del centro de Santander.' },
              { to: '/taller', icon: <Wrench size={20} aria-hidden="true" />, title: 'Taller de bicicletas', text: 'Reparación y mantenimiento de cualquier marca.' },
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
              ?
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl md:text-6xl text-[var(--color-cream)] tracking-wide leading-tight mb-3">
                ¿NO ESTÁ TU DUDA?
              </h2>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed max-w-md">
                Escríbenos o llámanos y te respondemos en menos de 24 horas.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 relative shrink-0">
              <Link to="/contacto">
                <Button variant="primary" size="lg" className="font-[var(--font-display)] tracking-widest text-lg w-full">
                  Contactar
                  <ArrowRight size={20} aria-hidden="true" />
                </Button>
              </Link>
              <Link to="/catalogo">
                <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide w-full">
                  Ver catálogo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
