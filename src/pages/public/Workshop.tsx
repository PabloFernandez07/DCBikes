import { useEffect, useRef, useState } from 'react'
import { Wrench, Settings, Star, Ruler, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { QuoteModal } from '@/components/public/QuoteModal'

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
    icon: <Wrench size={28} strokeWidth={1.5} />,
    title: 'Reparación',
    text: 'Diagnóstico completo y reparación de cualquier avería. Frenos, transmisión, ruedas, cuadro y más.',
    items: ['Revisión de frenos', 'Ajuste de cambios', 'Cambio de cables', 'Reparación de ruedas'],
  },
  {
    icon: <Settings size={28} strokeWidth={1.5} />,
    title: 'Mantenimiento',
    text: 'Revisiones periódicas para mantener tu bici en perfectas condiciones y alargar su vida útil.',
    items: ['Revisión básica', 'Revisión completa', 'Puesta a punto', 'Limpieza profunda'],
  },
  {
    icon: <Star size={28} strokeWidth={1.5} />,
    title: 'Personalización',
    text: 'Transforma tu bicicleta con componentes premium adaptados a tu estilo y necesidades.',
    items: ['Cambio de componentes', 'Upgrade de grupo', 'Pintura y acabados', 'Accesorios'],
  },
  {
    icon: <Ruler size={28} strokeWidth={1.5} />,
    title: 'Bike Fitting',
    text: 'Ajuste biomecánico profesional para maximizar el rendimiento y prevenir lesiones.',
    items: ['Análisis postural', 'Ajuste de sillín', 'Posición de manillar', 'Ajuste de calas'],
  },
]

export default function Workshop() {
  const [quoteOpen, setQuoteOpen] = useState(false)
  const pageRef = useReveal()

  return (
    <div ref={pageRef}>
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 30% 50%, rgba(196,162,207,0.06) 0%, transparent 70%)',
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Nuestro taller
          </p>
          <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none">
            TALLER<br />
            <span className="text-[var(--color-lavender)]">EXPERTO</span>
          </h1>
          <p className="rv mt-6 text-[var(--color-mid)] font-[var(--font-body)] text-lg max-w-xl leading-relaxed" style={{ transitionDelay: '100ms' }}>
            Mecánicos especializados con años de experiencia en todas las marcas
            y disciplinas. Tu bicicleta en las mejores manos.
          </p>
        </div>
      </section>

      {/* Services grid */}
      <section className="py-16 bg-[var(--color-ink-deep)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map(({ icon, title, text, items }, i) => (
              <div
                key={title}
                className="rv p-8 rounded-2xl bg-[var(--color-card)] border border-[var(--color-mid)]/10 hover:border-[rgba(196,162,207,0.2)] transition-all duration-300"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="text-[var(--color-lavender)] mb-4">{icon}</div>
                <h2 className="font-[var(--font-cond)] text-2xl font-semibold text-[var(--color-cream)] tracking-wide mb-3">
                  {title}
                </h2>
                <p className="text-[var(--color-mid)] text-sm leading-relaxed mb-5">{text}</p>
                <ul className="flex flex-col gap-2">
                  {items.map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
                      <span className="w-1 h-1 rounded-full bg-[var(--color-lavender)] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rv rounded-3xl bg-[var(--color-card)] border border-[rgba(196,162,207,0.2)] p-12 text-center flex flex-col items-center gap-6">
            <h2 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide">
              ¿LISTA PARA RODAR?
            </h2>
            <p className="text-[var(--color-mid)] text-base max-w-md leading-relaxed">
              Trae tu bicicleta al taller o escríbenos con lo que necesitas.
              Respondemos en menos de 24 horas.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={() => setQuoteOpen(true)}
              className="font-[var(--font-display)] tracking-widest text-xl"
            >
              Contactar con el taller
              <ArrowRight size={20} />
            </Button>
          </div>
        </div>
      </section>

      {quoteOpen && <QuoteModal productId={null} onClose={() => setQuoteOpen(false)} />}
    </div>
  )
}
