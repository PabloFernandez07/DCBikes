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

/**
 * Lee los settings legales desde Supabase. Si una key no tiene valor o no
 * existe todavía, la entrada queda como `null`.
 */
function useLegalSettings() {
  const [legal, setLegal] = useState<Record<string, string | null>>({})

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'legal_nif',
        'legal_company_cif',
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
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Denominación / Nombre comercial:</strong>{' '}
                DC Bikes Cantabria
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">NIF / CIF:</strong>{' '}
                {legal.legal_company_cif || legal.legal_nif ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_company_cif || legal.legal_nif}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-[var(--font-cond)] tracking-wide">
                    ⚠ Pendiente de configuración — rellena en Admin → Configuración → Facturación
                  </span>
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Forma jurídica:</strong>{' '}
                {legal.legal_forma_juridica ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_forma_juridica}</span>
                ) : (
                  <span className="text-[var(--color-cream)]">
                    Empresario individual no sujeto a inscripción en el Registro Mercantil conforme al artículo 19 del Código de Comercio
                  </span>
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Domicilio:</strong>{' '}
                <span className="text-[var(--color-cream)]">
                  {legal.store_address || 'Calle La Cantábrica, Bloque 2N, 1º BAJO, 39610 El Astillero, Cantabria'}
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
                  <a href="tel:+34942054501" className="text-[var(--color-lavender)] underline underline-offset-2">
                    +34 942 054 501
                  </a>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Inscripción registral:</strong>{' '}
                {legal.legal_inscripcion ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_inscripcion}</span>
                ) : (
                  <span className="text-[var(--color-cream)]">
                    No aplica (empresario individual, art. 19 del Código de Comercio)
                  </span>
                )}
              </p>
            </div>
          </Section>

          {/* 2. Objeto */}
          <Section title="2. Objeto y ámbito de aplicación">
            <p>
              El presente Aviso Legal regula el acceso y uso del sitio web{' '}
              <strong className="text-[var(--color-cream)]">dcbikescantabria.es</strong> (en adelante, «el sitio web»),
              del que es titular DC Bikes Cantabria. El sitio web ofrece información sobre los servicios de
              taller y, además, permite la <strong className="text-[var(--color-cream)]">contratación y venta
              online</strong> de los productos descritos en la sección 3.
            </p>
            <p>
              El acceso al sitio web y el uso de sus contenidos implican la aceptación plena y sin reservas
              de las presentes condiciones. La realización de una compra en la tienda online implica,
              adicionalmente, la aceptación de los{' '}
              <Link to="/terminos-venta" className="text-[var(--color-lavender)] underline underline-offset-2">
                Términos y condiciones de venta
              </Link>
              . DC Bikes Cantabria se reserva el derecho a modificar este aviso legal en cualquier momento.
            </p>
          </Section>

          {/* 3. Actividad */}
          <Section title="3. Actividad">
            <p>
              DC Bikes Cantabria es una tienda especializada en bicicletas, accesorios y servicios de taller
              con sede en El Astillero, Cantabria. La actividad principal del titular se desarrolla a través
              de los siguientes canales:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>
                <strong className="text-[var(--color-cream)]">Tienda física</strong> — venta de bicicletas,
                asesoramiento personalizado y servicios de taller y mantenimiento (los cuales se contratan
                exclusivamente de forma presencial).
              </li>
              <li>
                <strong className="text-[var(--color-cream)]">Tienda online</strong> — venta directa a través
                de este sitio web de <strong className="text-[var(--color-cream)]">accesorios, ropa
                ciclista, cascos, calzado, productos de nutrición deportiva y herramientas</strong>. Las
                bicicletas completas no se venden online y deben adquirirse en la tienda física.
              </li>
            </ul>
            <p>
              Las condiciones de la venta online (precios, envíos, plazos, garantía, devoluciones y
              desistimiento) se detallan en los{' '}
              <Link to="/terminos-venta" className="text-[var(--color-lavender)] underline underline-offset-2">
                Términos y condiciones de venta
              </Link>{' '}
              y en la{' '}
              <Link to="/devoluciones" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de devoluciones
              </Link>
              .
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

          {/* 8. Declaración de accesibilidad */}
          <Section title="8. Declaración de accesibilidad">
            <p>
              DC Bikes Cantabria se acoge a la exención prevista en el artículo 4.1 de la Ley 11/2023, de
              8 de mayo, de transposición de la Directiva (UE) 2019/882 (Acta Europea de Accesibilidad),
              por tratarse de una <strong className="text-[var(--color-cream)]">microempresa</strong>{' '}
              (empresario individual sin trabajadores asalariados). La obligación de cumplir con los
              requisitos de accesibilidad WCAG 2.1 AA establecidos por dicha ley no resulta de aplicación
              al presente sitio web.
            </p>
            <p>
              No obstante, el titular se compromete a atender de forma diligente cualquier solicitud
              razonable de adaptación que reciba a través del email de contacto{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>
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
