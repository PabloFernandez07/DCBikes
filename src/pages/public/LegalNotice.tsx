import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SEO } from '@/components/layout/SEO'
import { supabase } from '@/lib/supabase'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rv">
      <h2 className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-widest mb-4">
        {title}
      </h2>
      <div className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-[var(--font-cond)] tracking-wide">
      ✎ {label}
    </span>
  )
}

/**
 * Lee los settings legales desde Supabase. Si una key no tiene valor o no
 * existe todavía, la entrada queda como `null` y la UI muestra `<Pending>`.
 */
function useLegalSettings() {
  const [legal, setLegal] = useState<Record<string, string | null>>({})

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'legal_nif',
        'legal_forma_juridica',
        'legal_inscripcion',
        'store_address',
        'store_phone',
      ])
      .then(({ data }) => {
        const obj: Record<string, string | null> = {}
        for (const row of data ?? []) {
          try {
            const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
            obj[row.key] = v && String(v).trim() ? String(v) : null
          } catch {
            const v = row.value as unknown
            obj[row.key] = v && String(v).trim() ? String(v) : null
          }
        }
        setLegal(obj)
      })
  }, [])

  return legal
}

function Value({
  value,
  pendingLabel,
}: {
  value: string | null | undefined
  pendingLabel: string
}) {
  if (value && value.trim()) {
    return <span className="text-[var(--color-cream)]">{value}</span>
  }
  return <Pending label={pendingLabel} />
}

export default function LegalNotice() {
  const pageRef = useReveal()
  const legal = useLegalSettings()

  return (
    <>
      <SEO
        title="Aviso legal"
        description="Información legal e identificación del titular del sitio web DC Bikes Cantabria conforme a la LSSI-CE."
        url="https://dc-bikes-cantabria.vercel.app/aviso-legal"
      />

      <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="py-20">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Legal
          </p>
          <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6">
            AVISO LEGAL
          </h1>
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            Última actualización: mayo de 2026
          </p>
        </section>

        <div className="w-full pb-24 space-y-12">

          {/* 1. Identificación */}
          <Section title="1. Identificación del titular">
            <p>
              En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad
              de la Información y de Comercio Electrónico (LSSI-CE), se informa de que el titular de este
              sitio web es:
            </p>
            <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] space-y-2">
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Denominación / Nombre:</strong>{' '}
                DC Bikes Cantabria
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">NIF / CIF:</strong>{' '}
                <Value value={legal.legal_nif} pendingLabel="pendiente — rellena en Admin → Configuración" />
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Forma jurídica:</strong>{' '}
                <Value value={legal.legal_forma_juridica} pendingLabel="pendiente — p. ej. Autónomo / S.L. / S.A." />
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Domicilio:</strong>{' '}
                <span className="text-[var(--color-cream)]">
                  {legal.store_address || 'C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 El Astillero, Cantabria'}
                </span>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Correo electrónico:</strong>{' '}
                <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                  info@dcbikescantabria.es
                </a>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Teléfono:</strong>{' '}
                {legal.store_phone ? (
                  <a href={`tel:${legal.store_phone.replace(/\s/g, '')}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                    {legal.store_phone}
                  </a>
                ) : (
                  <Pending label="pendiente — rellena 'Teléfono' en Admin → Configuración" />
                )}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Inscripción registral:</strong>{' '}
                <Value value={legal.legal_inscripcion} pendingLabel="pendiente — Registro Mercantil si aplica, o 'No aplica' si autónomo" />
              </p>
            </div>
          </Section>

          {/* 2. Objeto */}
          <Section title="2. Objeto y ámbito de aplicación">
            <p>
              El presente Aviso Legal regula el acceso y uso del sitio web{' '}
              <strong className="text-[var(--color-cream)]">dcbikescantabria.es</strong> (en adelante, «el sitio web»),
              del que es titular DC Bikes Cantabria.
            </p>
            <p>
              El acceso al sitio web y el uso de sus contenidos implican la aceptación plena y sin reservas
              de las presentes condiciones. DC Bikes Cantabria se reserva el derecho a modificar este aviso
              legal en cualquier momento.
            </p>
          </Section>

          {/* 3. Actividad */}
          <Section title="3. Actividad">
            <p>
              DC Bikes Cantabria es una tienda especializada en bicicletas, ropa y accesorios, así como en
              servicios de taller y mantenimiento, con sede en El Astillero, Cantabria.
            </p>
            <p>
              El sitio web tiene carácter informativo y de captación de consultas. No realiza venta online
              directa; los presupuestos se gestionan de forma personalizada a través del formulario de
              contacto y por los canales habituales de la tienda.
            </p>
          </Section>

          {/* 4. Propiedad intelectual */}
          <Section title="4. Propiedad intelectual e industrial">
            <p>
              Todos los contenidos del sitio web (textos, fotografías, logotipos, diseño, código fuente,
              vídeos, etc.) son propiedad de DC Bikes Cantabria o de terceros que han autorizado su uso,
              y están protegidos por la legislación española e internacional en materia de propiedad
              intelectual e industrial.
            </p>
            <p>
              Queda prohibida la reproducción total o parcial, distribución, transformación o comunicación
              pública de los contenidos sin autorización escrita de DC Bikes Cantabria.
            </p>
          </Section>

          {/* 5. Responsabilidad */}
          <Section title="5. Limitación de responsabilidad">
            <p>
              DC Bikes Cantabria no se responsabiliza de los daños derivados de la imposibilidad de acceder
              al sitio web, de fallos de seguridad ajenos a su control, ni de los contenidos de sitios web
              de terceros enlazados desde este sitio.
            </p>
            <p>
              La información publicada en el sitio web tiene carácter orientativo y puede estar sujeta a
              cambios sin previo aviso. DC Bikes Cantabria hará todo lo posible por mantenerla actualizada
              y veraz.
            </p>
          </Section>

          {/* 6. Ley aplicable */}
          <Section title="6. Ley aplicable y jurisdicción">
            <p>
              El presente Aviso Legal se rige por la legislación española. Para cualquier controversia
              derivada del acceso o uso del sitio web, las partes se someten a los juzgados y tribunales
              competentes conforme a la normativa aplicable.
            </p>
          </Section>

          {/* 7. Protección de datos */}
          <Section title="7. Protección de datos y cookies">
            <p>
              El tratamiento de datos personales que se realiza a través de este sitio web se describe en
              la{' '}
              <Link to="/privacidad" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de privacidad
              </Link>
              . El uso de cookies queda regulado en la{' '}
              <Link to="/cookies" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de cookies
              </Link>
              .
            </p>
          </Section>

          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-xs">
            Para cualquier consulta,{' '}
            <Link to="/contacto" className="text-[var(--color-lavender)] underline underline-offset-2">
              contáctanos
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  )
}
