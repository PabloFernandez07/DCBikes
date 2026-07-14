import { useEffect, useRef, useState } from 'react'
import { Wrench, Settings, Star, ArrowRight, CheckCircle, Clock, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { QuoteModal } from '@/components/public/QuoteModal'
import { SEO } from '@/components/layout/SEO'
import { WorkshopHero } from '@/components/public/WorkshopHero'

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

const services = [
  {
    icon: <Wrench size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Reparación',
    text: 'Diagnóstico completo y reparación de cualquier avería, sea cual sea la marca o el tipo de bicicleta.',
    items: ['Revisión y ajuste de frenos', 'Reparación y ajuste de cambios', 'Cambio de cables y fundas', 'Reparación de ruedas y pinchaduras', 'Mantenimiento de horquillas y suspensiones'],
    accent: 'from-[rgba(196,162,207,0.15)] to-transparent',
  },
  {
    icon: <Settings size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Mantenimiento',
    text: 'Revisiones periódicas para mantener tu bici en perfectas condiciones y alargar su vida útil al máximo.',
    items: ['Revisión básica (puesta a punto)', 'Revisión completa (20 puntos)', 'Lavado de bicicletas', 'Limpieza y desengrase profundo', 'Lubricación de transmisión', 'Comprobación de rodamientos'],
    accent: 'from-[rgba(229,48,30,0.08)] to-transparent',
  },
  {
    icon: <Star size={32} strokeWidth={1.5} aria-hidden="true" />,
    title: 'Personalización & Upgrades',
    text: 'Dale una segunda vida a tu bicicleta o llévala al siguiente nivel con componentes premium.',
    items: ['Cambio y upgrade de grupo', 'Montaje de componentes', 'Instalación de accesorios', 'Cambio de ruedas y cubiertas', 'Asesoramiento de mejoras'],
    accent: 'from-[rgba(196,162,207,0.1)] to-transparent',
  },
]

const reasons = [
  { title: 'Mecánicos especializados', text: 'Años de experiencia con todo tipo de bicicletas: carretera, MTB, gravel, urbana y eléctrica.' },
  { title: 'Todas las marcas', text: 'Trabajamos con cualquier marca y modelo, sin importar dónde la hayas comprado.' },
  { title: 'Diagnóstico', text: 'Revisamos tu bicicleta y te damos el presupuesto antes de empezar. Sin sorpresas.' },
  { title: 'Entrega rápida', text: 'La mayoría de reparaciones las resolvemos en el mismo día o en 24-48 horas.' },
  { title: 'Garantía en mano de obra', text: 'Todo el trabajo realizado en nuestro taller está garantizado. Tu tranquilidad, primero.' },
  { title: 'Trato cercano', text: 'Somos un taller de barrio. Te explicamos qué le pasa a tu bici y qué necesita, sin tecnicismos.' },
]

export default function Workshop() {
  const [quoteOpen, setQuoteOpen] = useState(false)
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      <SEO
        title="Taller de bicicletas"
        description="Taller especializado en reparación y mantenimiento de bicicletas en El Astillero. Mecánicos expertos, diagnóstico rápido y garantía en todos los trabajos."
        url="https://dcbikescantabria.com/taller"
        breadcrumbs={[
          { name: "Inicio", url: "https://dcbikescantabria.com" },
          { name: "Taller", url: "https://dcbikescantabria.com/taller" },
        ]}
      />
      {/* Hero */}
      {/* Hero con el despiece de la Giant gobernado por el scroll. Tres pantallas
          y no cinco como la portada: el taller es una página de servicio, y quien
          entra viene a saber qué le arreglas y cuánto cuesta, no a ver cine. */}
      <WorkshopHero onQuoteOpen={() => setQuoteOpen(true)} />

      {/* Stats strip */}
      <section className="border-y border-[var(--color-card)] bg-[var(--color-ink-deep)] py-8">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: '+500', label: 'Bicis reparadas' },
              { value: '24h', label: 'Tiempo de respuesta' },
              { value: 'Todas', label: 'Las marcas' },
              { value: '100%', label: 'Garantía mano de obra' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="font-[var(--font-display)] text-4xl text-[var(--color-lavender)] tracking-wide">{value}</span>
                <span className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] tracking-widest uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Servicios
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              ¿QUÉ HACEMOS?
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {services.map(({ icon, title, text, items, accent }, i) => (
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
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed mb-6 font-[var(--font-body)]">{text}</p>
                  <ul className="flex flex-col gap-2.5">
                    {items.map(item => (
                      <li key={item} className="flex items-center gap-2.5 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
                        <CheckCircle size={14} className="text-[var(--color-lavender)] shrink-0" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Por qué elegirnos
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              EL TALLER DE CONFIANZA<br />DE CANTABRIA
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {reasons.map(({ title, text }, i) => (
              <div
                key={title}
                className="rv flex gap-4 p-6 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="w-8 h-8 rounded-lg bg-[rgba(196,162,207,0.12)] flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle size={16} className="text-[var(--color-lavender)]" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">{title}</p>
                  <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 md:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12">
            <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
              Cómo funciona
            </p>
            <h2 className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide">
              ASÍ DE SENCILLO
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Trae tu bici', text: 'Pásate por el taller o llámanos para contarnos qué le pasa a tu bicicleta.' },
              { step: '02', title: 'Diagnóstico', text: 'Revisamos la bici en detalle y te damos un presupuesto sin compromiso.' },
              { step: '03', title: 'Reparación', text: 'Con tu OK, nos ponemos manos a la obra. La mayoría de trabajos en 24-48h.' },
              { step: '04', title: 'A rodar', text: 'Te avisamos cuando esté lista. Recógela y disfruta de tu bici como nueva.' },
            ].map(({ step, title, text }, i) => (
              <div
                key={step}
                className="rv relative"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span className="block font-[var(--font-display)] text-6xl text-[rgba(196,162,207,0.12)] leading-none mb-3 select-none">
                  {step}
                </span>
                <h3 className="font-[var(--font-cond)] text-xl font-semibold text-[var(--color-cream)] tracking-wide mb-2">
                  {title}
                </h3>
                <p className="text-[var(--color-mid)] text-sm leading-relaxed font-[var(--font-body)]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Condiciones del servicio de taller (X-27) */}
      <section className="py-16 md:py-24 bg-[var(--color-ink-deep)]">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="rv mb-10 md:mb-12 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(196,162,207,0.12)] flex items-center justify-center shrink-0">
              <FileText size={20} className="text-[var(--color-lavender)]" aria-hidden="true" />
            </div>
            <div>
              <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-1">
                Información legal
              </p>
              <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl text-[var(--color-cream)] tracking-wide">
                CONDICIONES DEL TALLER
              </h2>
            </div>
          </div>

          <div className="rv max-w-3xl space-y-6 text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed">
            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Citas y recepción
              </p>
              <p>
                Atendemos por orden de llegada y, preferentemente, mediante cita previa para
                garantizar la disponibilidad de los mecánicos. Puedes solicitar cita por teléfono,
                en tienda o a través del formulario de presupuesto.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Presupuesto previo y diagnóstico
              </p>
              <p>
                El diagnóstico inicial y el presupuesto son <strong className="text-[var(--color-cream)]">gratuitos
                siempre que la revisión no exceda de 30 minutos</strong>. Si la valoración requiere un despiece o
                pruebas más prolongadas, te informaremos previamente del coste antes de continuar. No iniciaremos
                ninguna reparación sin tu aprobación expresa del presupuesto.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Plazos de reparación
              </p>
              <p>
                Los plazos que indicamos son <strong className="text-[var(--color-cream)]">orientativos</strong> y
                dependen de la complejidad del trabajo y de la disponibilidad de recambios. La mayoría de
                reparaciones se resuelven en 24-48 horas, pero los plazos pueden variar; te mantendremos
                informado de cualquier demora.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Recambios aportados por el cliente
              </p>
              <p>
                Si optas por aportar tus propios recambios, realizaremos el montaje pero{' '}
                <strong className="text-[var(--color-cream)]">la garantía no cubrirá la pieza aportada ni los
                defectos derivados de su calidad o idoneidad</strong>: la garantía del taller se limita en ese
                caso exclusivamente a la mano de obra. Recomendamos consultarnos antes de adquirir componentes
                por tu cuenta.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Custodia de la bicicleta tras la reparación
              </p>
              <p>
                Una vez te avisemos de que la bicicleta está lista, dispones de un plazo de{' '}
                <strong className="text-[var(--color-cream)]">30 días naturales</strong> para recogerla sin coste.
                Transcurrido ese plazo, podremos aplicar un{' '}
                <strong className="text-[var(--color-cream)]">gasto de custodia de 5 € por día</strong> en concepto
                de almacenaje, previa comunicación al cliente. Te contactaremos antes de aplicar cualquier cargo.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Pago
              </p>
              <p>
                El pago de los servicios de taller se realiza{' '}
                <strong className="text-[var(--color-cream)]">contra entrega</strong>, en el momento de recoger la
                bicicleta reparada.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[rgba(229,48,30,0.06)] border border-[var(--color-brand-red)]/20">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1.5">
                Derecho de desistimiento
              </p>
              <p>
                Los servicios de reparación y mantenimiento de taller son servicios prestados a medida y conforme
                a tus especificaciones. Por ello, una vez ejecutado el servicio con tu consentimiento previo,{' '}
                <strong className="text-[var(--color-cream)]">no resulta de aplicación el derecho de
                desistimiento</strong>, conforme al <strong className="text-[var(--color-cream)]">art. 103.a del
                Real Decreto Legislativo 1/2007</strong> (contratos de servicios totalmente ejecutados, cuando la
                ejecución haya comenzado con el consentimiento expreso del consumidor).
              </p>
            </div>

            <p className="text-xs">
              Estas condiciones se aplican exclusivamente a los servicios de taller. La venta de productos en la
              tienda online se rige por los{' '}
              <Link to="/terminos-venta" className="text-[var(--color-lavender)] underline underline-offset-2">
                Términos de venta
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* CTA banner */}
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
                ¿LISTA PARA RODAR?
              </h2>
              <div className="flex items-center gap-2 text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide">
                <Clock size={14} className="text-[var(--color-lavender)]" aria-hidden="true" />
                Respondemos en menos de 24 horas
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 relative shrink-0">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setQuoteOpen(true)}
                className="font-[var(--font-display)] tracking-widest text-xl"
              >
                Pedir presupuesto
                <ArrowRight size={20} aria-hidden="true" />
              </Button>
              <Link to="/contacto">
                <Button variant="secondary" size="lg" className="font-[var(--font-cond)] tracking-wide w-full">
                  Ver ubicación
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {quoteOpen && <QuoteModal productId={null} onClose={() => setQuoteOpen(false)} />}
    </div>
  )
}
