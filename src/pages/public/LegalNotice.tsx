import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SEO } from '@/components/layout/SEO'
import { useLegalIdentity } from '@/hooks/useLegalIdentity'
import { useStoreAddress } from '@/hooks/useStoreAddress'
import { LAST_AUDIT_DATE } from '@/lib/legal-versions'

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

function Section({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section className="rv" id={id}>
      <h2 className="font-[var(--font-display)] text-xl md:text-2xl text-[var(--color-cream)] tracking-widest mb-4">
        {title}
      </h2>
      <div className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

function PendingValue({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-[var(--font-cond)] tracking-wide">
      {label}
    </span>
  )
}

export default function LegalNotice() {
  const pageRef = useReveal()
  const legal = useLegalIdentity()
  const storeAddress = useStoreAddress()

  const cif = legal?.cif ?? null
  const formaJuridica = legal?.formaJuridica ?? null
  const inscripcion = legal?.inscripcion ?? null
  const address = legal?.address ?? storeAddress
  const companyName = legal?.companyName ?? 'DC Bikes Cantabria'
  const contactEmail = legal?.contactEmail ?? 'info@dcbikescantabria.com'

  return (
    <>
      <SEO
        title="Aviso legal"
        description="Información legal e identificación del titular del sitio web DC Bikes Cantabria conforme a la LSSI-CE."
        url="https://dcbikescantabria.com/aviso-legal"
      />

      <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="py-12 md:py-20">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Legal
          </p>
          <h1 className="rv font-[var(--font-display)] text-5xl md:text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6 break-words">
            AVISO LEGAL
          </h1>
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            Última actualización: {LAST_AUDIT_DATE}
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
                <span className="text-[var(--color-cream)]">{companyName}</span>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">NIF / CIF:</strong>{' '}
                {cif ? (
                  <span className="text-[var(--color-cream)]">{cif}</span>
                ) : (
                  <PendingValue label="Pendiente de configuración — rellena en Admin → Configuración → Facturación" />
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Forma jurídica:</strong>{' '}
                {formaJuridica ? (
                  <span className="text-[var(--color-cream)]">{formaJuridica}</span>
                ) : (
                  <PendingValue label="Pendiente — p. ej. Empresario individual (autónomo)" />
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Domicilio:</strong>{' '}
                <span className="text-[var(--color-cream)]">{address}</span>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Correo electrónico:</strong>{' '}
                <a href={`mailto:${contactEmail}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                  {contactEmail}
                </a>
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Inscripción registral:</strong>{' '}
                {inscripcion ? (
                  <span className="text-[var(--color-cream)]">{inscripcion}</span>
                ) : (
                  <PendingValue label="Pendiente — Registro Mercantil, o 'No aplica' si autónomo" />
                )}
              </p>
            </div>
          </Section>

          {/* 2. Objeto */}
          <Section title="2. Objeto y ámbito de aplicación">
            <p>
              El presente Aviso Legal regula el acceso y uso del sitio web{' '}
              <strong className="text-[var(--color-cream)]">dcbikescantabria.com</strong> (en adelante, «el sitio web»),
              del que es titular {companyName}. El sitio web ofrece información sobre los servicios de
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
              . {companyName} se reserva el derecho a modificar este aviso legal en cualquier momento.
            </p>
          </Section>

          {/* 3. Actividad */}
          <Section title="3. Actividad">
            <p>
              {companyName} es una tienda especializada en bicicletas, accesorios y servicios de taller
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
              vídeos, etc.) son propiedad de {companyName} o de terceros que han autorizado su uso,
              y están protegidos por la legislación española e internacional en materia de propiedad
              intelectual e industrial.
            </p>
            <p>
              Queda prohibida la reproducción total o parcial, distribución, transformación o comunicación
              pública de los contenidos sin autorización escrita de {companyName}.
            </p>
          </Section>

          {/* 5. Responsabilidad */}
          <Section title="5. Limitación de responsabilidad">
            <p>
              {companyName} no se responsabiliza de los daños derivados de la imposibilidad de acceder
              al sitio web, de fallos de seguridad ajenos a su control, ni de los contenidos de sitios web
              de terceros enlazados desde este sitio.
            </p>
            <p>
              La información publicada en el sitio web tiene carácter orientativo y puede estar sujeta a
              cambios sin previo aviso. {companyName} hará todo lo posible por mantenerla actualizada
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
          <Section title="8. Declaración de accesibilidad" id="accesibilidad">
            <p>
              {companyName} trabaja para cumplir progresivamente los requisitos de accesibilidad WCAG 2.1 AA
              exigidos por el Reglamento (UE) 2019/882 (European Accessibility Act) y la Ley 11/2023 de
              accesibilidad universal, que entran en vigor para servicios de comercio electrónico desde el
              28 de junio de 2025. Esta web está actualmente en proceso de adaptación.
            </p>
            <p>
              Si encuentras una barrera de accesibilidad, escríbenos a{' '}
              <a href={`mailto:${contactEmail}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                {contactEmail}
              </a>
              ; responderemos en un plazo máximo de 14 días naturales. También puedes presentar una
              reclamación ante la{' '}
              <a
                href="https://www.defensordelpueblo.es"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                Defensoría del Pueblo
              </a>{' '}
              o ante la Agencia Española de Supervisión de la Inteligencia Artificial (AESIA) cuando aplique.
            </p>
            <p>
              <strong className="text-[var(--color-cream)]">Plan de remediación:</strong>{' '}
              estamos auditando contraste, navegación por teclado, ARIA, foco visible y{' '}
              <code className="text-[var(--color-cream)]">prefers-reduced-motion</code>. Las mejoras se
              publican progresivamente en cada despliegue.
            </p>
          </Section>

          {/* 9. Punto de contacto DSA — X-01 auditoría V5 */}
          <Section id="dsa" title="9. Punto de contacto único (Reglamento UE 2022/2065 - DSA)">
            <p>
              Conforme al artículo 11 del Reglamento (UE) 2022/2065 (Ley de Servicios Digitales — DSA),
              {companyName} designa como punto de contacto único para autoridades competentes, usuarios
              y la Comisión Europea:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>
                <strong className="text-[var(--color-cream)]">Email:</strong>{' '}
                <a
                  href="mailto:dsa@dcbikescantabria.com"
                  className="text-[var(--color-lavender)] underline underline-offset-2"
                >
                  dsa@dcbikescantabria.com
                </a>
              </li>
              <li>
                <strong className="text-[var(--color-cream)]">Idiomas de comunicación:</strong>{' '}
                Español e Inglés.
              </li>
              <li>
                <strong className="text-[var(--color-cream)]">Mecanismo notice-and-action:</strong>{' '}
                para denunciar contenido potencialmente ilícito (reseñas inadecuadas, comentarios
                infractores, etc.), envía un correo electrónico a la dirección anterior con el asunto{' '}
                <em>«DSA notice»</em> indicando la URL del contenido, el motivo y tus datos de contacto.
                Te responderemos sin demora indebida indicando la decisión adoptada (mantener, retirar
                o suspender) y los motivos de la misma.
              </li>
            </ul>
            <p className="text-xs text-[var(--color-mid)]">
              {companyName} es una microempresa exenta de las obligaciones específicas aplicables a
              plataformas en línea de gran tamaño, pero asume voluntariamente este punto de contacto
              único para facilitar el cumplimiento del Reglamento DSA.
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
