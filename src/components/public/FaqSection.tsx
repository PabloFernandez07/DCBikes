import { ChevronDown } from 'lucide-react'

export interface FaqItem {
  question: string
  answer: string
}

/**
 * Construye el JSON-LD de tipo FAQPage a partir de una lista de preguntas.
 * Úsalo en el prop `jsonLd` del componente <SEO> para que Google muestre
 * el resultado enriquecido (desplegables) en la búsqueda.
 */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

/**
 * Acordeón de preguntas frecuentes accesible (usa <details>/<summary> nativo,
 * funciona sin JS y es navegable por teclado). Estilizado con el sistema de
 * diseño de DC Bikes. El JSON-LD se inyecta aparte vía <SEO jsonLd={faqJsonLd(items)}>.
 */
export function FaqSection({
  items,
  title = 'Preguntas frecuentes',
  subtitle,
}: {
  items: FaqItem[]
  title?: string
  subtitle?: string
}) {
  return (
    <section className="py-16 md:py-24" aria-labelledby="faq-heading">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 md:mb-12">
          <p className="font-[var(--font-cond)] text-[var(--color-lavender)] tracking-[0.3em] uppercase text-xs sm:text-sm mb-3">
            Resolvemos tus dudas
          </p>
          <h2
            id="faq-heading"
            className="font-[var(--font-display)] text-4xl md:text-5xl text-[var(--color-cream)] tracking-wide"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-[var(--color-mid)] font-[var(--font-body)] text-base md:text-lg leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-[var(--color-card-hover)] bg-[var(--color-card)] overflow-hidden transition-colors hover:border-[var(--color-lavender)]/40 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 md:px-6 md:py-5 select-none">
                <span className="font-[var(--font-cond)] text-lg md:text-xl text-[var(--color-cream)] tracking-wide">
                  {item.question}
                </span>
                <ChevronDown
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-lavender)] transition-transform duration-300 group-open:rotate-180"
                />
              </summary>
              <div className="px-5 pb-5 md:px-6 md:pb-6 -mt-1">
                <p className="text-[var(--color-cream-dim)] font-[var(--font-body)] text-sm md:text-base leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
