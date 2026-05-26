import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SEO } from '@/components/layout/SEO'

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

export default function PrivacyPolicy() {
  const pageRef = useReveal()

  return (
    <>
      <SEO
        title="Política de privacidad"
        description="Información sobre el tratamiento de datos personales en DC Bikes Cantabria conforme al RGPD."
        url="https://dc-bikes-cantabria.vercel.app/privacidad"
      />

      <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="py-20">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Legal
          </p>
          <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6">
            POLÍTICA DE PRIVACIDAD
          </h1>
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            Última actualización: mayo de 2026
          </p>
        </section>

        <div className="w-full pb-24 space-y-12">
          {/* 1. Responsable */}
          <Section title="1. Responsable del tratamiento">
            <p>
              En cumplimiento del Reglamento (UE) 2016/679 General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018
              (LOPDGDD), te informamos de que el responsable del tratamiento de tus datos personales es:
            </p>
            <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] space-y-1.5">
              <p><strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Denominación:</strong> DC Bikes Cantabria</p>
              <p><strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Dirección:</strong> C. la Cantábrica bloque 2, El Astillero, Cantabria</p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Correo electrónico:</strong>{' '}
                <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                  info@dcbikescantabria.es
                </a>
              </p>
            </div>
          </Section>

          {/* 2. Datos recogidos */}
          <Section title="2. Datos personales que recogemos">
            <p>
              Recogemos únicamente los datos que tú nos facilitas voluntariamente al utilizar el sitio:
            </p>
            <p>
              <strong className="text-[var(--color-cream)]">A través del formulario de presupuesto:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Nombre</strong> — para personalizar la comunicación.</li>
              <li><strong className="text-[var(--color-cream)]">Dirección de correo electrónico</strong> — para responderte.</li>
              <li><strong className="text-[var(--color-cream)]">Número de teléfono</strong> (opcional) — para contacto directo si lo solicitas.</li>
            </ul>
            <p>
              <strong className="text-[var(--color-cream)]">A través de la tienda online (al realizar un pedido):</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Nombre y apellidos</strong>, dirección postal completa y teléfono — para preparar y enviar el pedido y emitir la factura.</li>
              <li><strong className="text-[var(--color-cream)]">Correo electrónico</strong> — para enviarte la confirmación, el estado del pedido y la factura.</li>
              <li><strong className="text-[var(--color-cream)]">DNI/NIF</strong> (cuando sea exigible para la facturación).</li>
              <li><strong className="text-[var(--color-cream)]">Datos del pedido</strong> (productos, importe, fecha).</li>
            </ul>
            <p>
              No almacenamos en ningún momento los datos completos de tu tarjeta bancaria: el pago se procesa
              íntegramente en el entorno cifrado de la pasarela <strong className="text-[var(--color-cream)]">Redsys</strong>{' '}
              (véase sección 7). Todas las comunicaciones se transmiten mediante conexión cifrada (HTTPS).
            </p>
          </Section>

          {/* 3. Finalidad */}
          <Section title="3. Finalidad del tratamiento">
            <p>
              Tus datos se utilizan exclusivamente para las siguientes finalidades:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Gestionar y responder tu consulta o solicitud de presupuesto.</li>
              <li>Facilitarte información sobre los productos o servicios por los que preguntas.</li>
              <li>
                <strong className="text-[var(--color-cream)]">Gestionar tus pedidos online</strong>: preparación,
                envío, facturación, atención posventa y devoluciones.
              </li>
              <li>Cumplir las obligaciones legales contables, fiscales y mercantiles derivadas de la venta.</li>
            </ul>
            <p>
              No utilizamos tus datos para elaborar perfiles comerciales ni para enviarte comunicaciones no solicitadas.
            </p>
          </Section>

          {/* 4. Base legal */}
          <Section title="4. Base legal del tratamiento">
            <p>
              Las bases legales que legitiman cada tratamiento son:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong className="text-[var(--color-cream)]">Solicitudes de presupuesto / formulario de contacto</strong>:{' '}
                tu <strong className="text-[var(--color-cream)]">consentimiento expreso</strong> (art. 6.1.a RGPD),
                que otorgas al marcar la casilla de aceptación antes de enviar el formulario.
              </li>
              <li>
                <strong className="text-[var(--color-cream)]">Gestión de pedidos online</strong>:{' '}
                <strong className="text-[var(--color-cream)]">ejecución de un contrato</strong> en el que el cliente
                es parte (art. 6.1.b RGPD). Sin estos datos no es posible procesar, enviar ni facturar el pedido.
              </li>
              <li>
                <strong className="text-[var(--color-cream)]">Conservación de facturas y registros contables</strong>:{' '}
                <strong className="text-[var(--color-cream)]">cumplimiento de obligación legal</strong> (art. 6.1.c RGPD), conforme al
                art. 30 del Código de Comercio y al art. 29 de la Ley General Tributaria.
              </li>
            </ul>
            <p>
              Puedes retirar tu consentimiento (cuando éste sea la base legal aplicable) en cualquier momento
              enviándonos un correo a{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>.
              La retirada del consentimiento no afecta a la licitud del tratamiento realizado con anterioridad.
            </p>
          </Section>

          {/* 5. Conservación */}
          <Section title="5. Plazo de conservación">
            <p>
              Los plazos de conservación varían en función de la finalidad y la base legal aplicable:
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-card-hover)]">
              <table className="w-full text-xs font-[var(--font-body)]">
                <thead>
                  <tr className="bg-[var(--color-card)] border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">Datos</th>
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">Plazo de conservación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-card-hover)]">
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Solicitudes de presupuesto / contacto</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Hasta la finalización de la consulta + 1 año (atención al cliente)</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Datos de pedido y facturación</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]"><strong className="text-[var(--color-cream)]">6 años</strong> (art. 30 Código de Comercio y art. 29 LGT)</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Comunicaciones comerciales (opt-in)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Hasta revocación del consentimiento</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs">
              Transcurridos los plazos indicados, los datos serán suprimidos o anonimizados de forma irreversible,
              o en su caso bloqueados conforme al art. 32 LOPDGDD durante el tiempo en que pudieran derivarse
              responsabilidades legales.
            </p>
          </Section>

          {/* 6. Derechos */}
          <Section title="6. Tus derechos">
            <p>
              De acuerdo con el RGPD y la LOPDGDD, puedes ejercer en cualquier momento los siguientes derechos:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Acceso</strong> — conocer qué datos tuyos tratamos.</li>
              <li><strong className="text-[var(--color-cream)]">Rectificación</strong> — corregir datos inexactos o incompletos.</li>
              <li><strong className="text-[var(--color-cream)]">Supresión</strong> — solicitar que eliminemos tus datos.</li>
              <li><strong className="text-[var(--color-cream)]">Oposición</strong> — oponerte al tratamiento de tus datos.</li>
              <li><strong className="text-[var(--color-cream)]">Portabilidad</strong> — recibir tus datos en un formato estructurado y de uso común.</li>
            </ul>
            <p>
              Para ejercer cualquiera de estos derechos, escríbenos a{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>{' '}
              o visítanos en C. la Cantábrica bloque 2, El Astillero, Cantabria.
            </p>
            <p>
              Si consideras que el tratamiento no se ajusta a la normativa, puedes presentar una reclamación ante la{' '}
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                Agencia Española de Protección de Datos (AEPD)
              </a>.
            </p>
          </Section>

          {/* 7. Encargados + cesión */}
          <Section title="7. Encargados del tratamiento y cesión de datos">
            <p>
              DC Bikes Cantabria <strong className="text-[var(--color-cream)]">no cederá tus datos personales a terceros</strong>{' '}
              para sus propios fines, salvo que exista una obligación legal que lo requiera (p.&nbsp;ej., requerimiento de autoridad competente).
            </p>
            <p>
              Para prestar el servicio, contamos con los siguientes <strong className="text-[var(--color-cream)]">encargados del tratamiento</strong>{' '}
              (art.&nbsp;28 RGPD), que acceden a tus datos únicamente para ejecutar los servicios contratados por DC Bikes Cantabria
              y están sujetos a las mismas obligaciones de confidencialidad y seguridad:
            </p>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-card-hover)]">
              <table className="w-full text-xs font-[var(--font-body)]">
                <thead>
                  <tr className="bg-[var(--color-card)] border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">Proveedor</th>
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">Finalidad</th>
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">País</th>
                    <th className="px-4 py-2.5 text-left text-[var(--color-cream)] font-[var(--font-cond)] tracking-wide">Garantías</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-card-hover)]">
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Supabase, Inc.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Almacenamiento de base de datos y autenticación</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">UE (región eu-west)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Cláusulas contractuales tipo (CCT)</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Resend, Inc.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Envío de correos electrónicos transaccionales</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Cláusulas contractuales tipo (CCT)</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Redsys Servicios de Procesamiento, S.L.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Procesamiento del pago con tarjeta y Bizum (pasarela TPV)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">España (UE)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Sin transferencia internacional · PCI-DSS</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong className="text-[var(--color-cream)]">Redsys</strong> (CIF B85955367) actúa como entidad
              procesadora de los pagos en su condición de encargado del tratamiento (art. 28 RGPD). La base legal
              de este tratamiento es la <strong className="text-[var(--color-cream)]">ejecución del contrato de
              compraventa</strong> (art. 6.1.b RGPD). Los datos tratados se limitan al nombre del titular, el
              importe del pedido y los datos de la tarjeta, que se procesan íntegramente en el entorno seguro de
              Redsys: <strong className="text-[var(--color-cream)]">en ningún momento {' '}
              DC Bikes Cantabria almacena los datos completos de tu tarjeta</strong>. Más información en la{' '}
              <a
                href="https://www.redsys.es/politica-de-privacidad.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                política de privacidad de Redsys
              </a>.
            </p>
            <p>
              Las transferencias internacionales a EE.&nbsp;UU. están amparadas por las Cláusulas Contractuales Tipo
              aprobadas por la Comisión Europea (Decisión 2021/914), que garantizan un nivel de protección equivalente
              al exigido en el Espacio Económico Europeo.
            </p>
          </Section>

          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-xs">
            Nos reservamos el derecho a actualizar esta política para adaptarla a cambios normativos o técnicos.
            Si tienes cualquier duda,{' '}
            <Link to="/contacto" className="text-[var(--color-lavender)] underline underline-offset-2">
              contáctanos
            </Link>.
          </p>
        </div>
      </div>
    </>
  )
}
