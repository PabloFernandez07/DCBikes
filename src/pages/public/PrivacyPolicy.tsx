import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SEO } from '@/components/layout/SEO'
import { useStoreAddress } from '@/hooks/useStoreAddress'
import { supabase } from '@/lib/supabase'
import { PRIVACY_VERSION } from '@/lib/legal-versions'

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

function useLegalSettings() {
  const [legal, setLegal] = useState<Record<string, string | null>>({})

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', ['legal_company_name', 'legal_company_cif', 'legal_company_address', 'legal_forma_juridica'])
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
  const storeAddress = useStoreAddress()
  const legal = useLegalSettings()

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
            Última actualización: {PRIVACY_VERSION}
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
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Denominación:</strong>{' '}
                {legal.legal_company_name ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_company_name}</span>
                ) : (
                  <span className="text-[var(--color-cream)]">DC Bikes Cantabria</span>
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">NIF / CIF:</strong>{' '}
                {legal.legal_company_cif ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_company_cif}</span>
                ) : (
                  <span className="text-red-600 font-bold">[Pendiente]</span>
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Forma jurídica:</strong>{' '}
                {legal.legal_forma_juridica ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_forma_juridica}</span>
                ) : (
                  <span className="text-red-600 font-bold">[Pendiente]</span>
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Dirección:</strong>{' '}
                {legal.legal_company_address ? (
                  <span className="text-[var(--color-cream)]">{legal.legal_company_address}</span>
                ) : (
                  <span className="text-[var(--color-cream)]">{storeAddress}</span>
                )}
              </p>
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
                  {/* P-10 auditoría V3: fila "Comunicaciones comerciales" eliminada porque no existe tratamiento real (sin newsletter activo). Reintroducir solo cuando haya doble opt-in declarado. */}
                </tbody>
              </table>
            </div>
            <p className="text-xs">
              Transcurridos los plazos indicados, los datos serán suprimidos o anonimizados de forma irreversible,
              o en su caso bloqueados conforme al art. 32 LOPDGDD durante el tiempo en que pudieran derivarse
              responsabilidades legales.
            </p>
            <p className="text-xs">
              Transcurridos los plazos indicados, los datos se anonimizan o se eliminan automáticamente mediante
              un proceso técnico diario. Los datos contables que la legislación obliga a conservar (facturas, IVA,
              IRPF) se anonimizan parcialmente: se preserva la información legalmente requerida pero se eliminan
              los datos identificativos no esenciales (teléfono, dirección de entrega, notas).
            </p>
          </Section>

          {/* 5 bis. Derecho de supresión (art. 17 RGPD) */}
          <Section title="5 bis. Derecho de supresión y obligaciones legales de conservación">
            <p>
              El <strong className="text-[var(--color-cream)]">art. 17 del RGPD</strong> reconoce tu derecho a
              solicitar la supresión de tus datos personales (también conocido como "derecho al olvido"). Sin
              embargo, este derecho no es absoluto: el <strong className="text-[var(--color-cream)]">art. 17.3.b
              RGPD</strong> permite a DC Bikes Cantabria conservar determinados datos durante el plazo en que
              exista una obligación legal de hacerlo.
            </p>
            <p>
              Esa obligación legal se concreta, en nuestro caso, en el{' '}
              <strong className="text-[var(--color-cream)]">art. 30 del Código de Comercio</strong> y el{' '}
              <strong className="text-[var(--color-cream)]">art. 66 de la Ley General Tributaria</strong>, que
              imponen la conservación de la documentación contable y fiscal durante{' '}
              <strong className="text-[var(--color-cream)]">seis años</strong> desde la fecha del último pedido o
              factura.
            </p>
            <p>
              En la práctica, si solicitas la supresión y tienes pedidos con menos de 6 años de antigüedad,
              procederemos a una <strong className="text-[var(--color-cream)]">anonimización parcial</strong>:
              eliminaremos los datos identificativos no esenciales (teléfono, dirección de entrega, notas) y
              mantendremos exclusivamente los datos contables y de facturación que la ley nos obliga a conservar.
              Estos datos no son accesibles para terceros y se eliminarán automáticamente una vez transcurrido
              el plazo legal.
            </p>
            <p>
              Para ejercer este derecho envíanos un correo a{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>{' '}
              indicando que solicitas la supresión de tus datos. El{' '}
              <strong className="text-[var(--color-cream)]">plazo legal de respuesta es de 1 mes</strong> desde
              la recepción (art. 12.3 RGPD), prorrogable a 3 meses en casos especialmente complejos previa
              notificación al interesado.
            </p>
          </Section>

          {/* 6. Derechos */}
          <Section title="6. Tus derechos">
            <p>
              De acuerdo con el RGPD y la LOPDGDD, puedes ejercer en cualquier momento los siguientes derechos:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Acceso</strong> (art. 15 RGPD) — conocer qué datos tuyos tratamos.</li>
              <li><strong className="text-[var(--color-cream)]">Rectificación</strong> (art. 16 RGPD) — corregir datos inexactos o incompletos.</li>
              <li><strong className="text-[var(--color-cream)]">Supresión</strong> (art. 17 RGPD) — solicitar que eliminemos tus datos.</li>
              <li><strong className="text-[var(--color-cream)]">Limitación del tratamiento</strong> (art. 18 RGPD) — solicitar que restrinjamos temporalmente el tratamiento de tus datos.</li>
              <li><strong className="text-[var(--color-cream)]">Oposición</strong> (art. 21 RGPD) — oponerte al tratamiento de tus datos.</li>
              <li><strong className="text-[var(--color-cream)]">Portabilidad</strong> (art. 20 RGPD) — recibir tus datos en un formato estructurado, de uso común y lectura mecánica.</li>
              <li><strong className="text-[var(--color-cream)]">No ser objeto de decisiones automatizadas</strong> (art. 22 RGPD) — derecho a que ninguna decisión que produzca efectos jurídicos sobre tu persona sea tomada exclusivamente por medios automatizados (ver sección 9).</li>
            </ul>
            <p>
              Para ejercer cualquiera de estos derechos, escríbenos a{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>{' '}
              o visítanos en {storeAddress}.
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
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU. (sede social) · Datos en eu-west-1 (Irlanda)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">CCT 2021/914 · DPA · TIA</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Vercel Inc.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Alojamiento del frontend (sitio web) y CDN</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU. (Delaware)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">CCT 2021/914 · DPA estándar Vercel</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Google LLC</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Mapa de localización (Google Maps) en la página de contacto</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU. (Mountain View)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">CCT 2021/914 · Solo si el usuario consiente cookies de terceros</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Resend, Inc.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Envío de correos electrónicos transaccionales</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">CCT 2021/914</td>
                  </tr>
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Redsys Servicios de Procesamiento, S.L.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Procesamiento del pago con tarjeta y Bizum (pasarela TPV)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">España (UE)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Sin transferencia internacional · PCI-DSS</td>
                  </tr>
                  {/* P-04: Cloudflare añadido como encargado de tratamiento (DPF UE-EE.UU.) */}
                  <tr className="bg-[var(--color-ink)]">
                    <td className="px-4 py-3 text-[var(--color-cream)]">Cloudflare, Inc.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">Prevención de fraude y bots (Cloudflare Turnstile) en formularios de contacto y presupuesto. Base legal: art. 6.1.b RGPD (medida pre-contractual) + art. 6.1.f RGPD (interés legítimo: anti-fraude) + art. 22.2 LSSI.</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EE. UU. (San Francisco)</td>
                    <td className="px-4 py-3 text-[var(--color-mid)]">EU-US Data Privacy Framework (DPF) — Cloudflare certificado · DPA estándar Cloudflare</td>
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
              <strong className="text-[var(--color-cream)]">Supabase, Inc.</strong> (Delaware, EE.&nbsp;UU.) actúa
              como proveedor de la infraestructura de base de datos y autenticación. El{' '}
              <strong className="text-[var(--color-cream)]">almacenamiento físico de los datos se realiza en la
              región europea eu-west-1 (Irlanda)</strong>. La transferencia internacional al responsable del
              tratamiento (acceso por personal de soporte de Supabase con sede en EE.&nbsp;UU.) está amparada
              por las{' '}
              <strong className="text-[var(--color-cream)]">Cláusulas Contractuales Tipo 2021/914</strong> de
              la Comisión Europea, complementadas con DPA (Data Processing Agreement) firmado y evaluación{' '}
              <strong className="text-[var(--color-cream)]">TIA</strong> (Transfer Impact Assessment) que
              verifica la equivalencia del nivel de protección.
            </p>
            <p>
              Las transferencias internacionales a EE.&nbsp;UU. de los restantes encargados están amparadas,
              en todos los casos, por las Cláusulas Contractuales Tipo aprobadas por la Comisión Europea
              (Decisión 2021/914), que garantizan un nivel de protección equivalente al exigido en el
              Espacio Económico Europeo.
            </p>
          </Section>

          {/* 7 bis. Reseñas de Google */}
          <Section title="7 bis. Reseñas de Google">
            <p>
              Mostramos en nuestra web reseñas que nuestros clientes y visitantes han publicado voluntariamente
              en Google Maps sobre nuestro negocio. Estas reseñas incluyen el nombre y, en su caso, la foto de
              perfil tal y como el autor las publicó en Google. La base legal para esta publicación es nuestro{' '}
              <strong className="text-[var(--color-cream)]">interés legítimo</strong> en compartir valoraciones
              reales de nuestros clientes (<strong className="text-[var(--color-cream)]">art. 6.1.f RGPD</strong>).
              Si eres autor de una reseña y deseas que retiremos su visualización en nuestra web, escríbenos a{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>{' '}
              y procederemos a su retirada en plazo razonable.
            </p>
          </Section>

          {/* 8. Decisiones automatizadas */}
          <Section title="8. Decisiones automatizadas y elaboración de perfiles">
            <p>
              No se realizan decisiones automatizadas ni elaboración de perfiles en el sentido del{' '}
              <strong className="text-[var(--color-cream)]">artículo 22 del RGPD</strong>. Toda decisión
              que afecte al cliente (aceptación o rechazo de pedido, gestión de incidencias, devoluciones,
              etc.) es <strong className="text-[var(--color-cream)]">tomada manualmente por el personal de
              DC Bikes Cantabria</strong>.
            </p>
          </Section>

          {/* 9. DPO */}
          <Section title="9. Delegado de Protección de Datos (DPO)">
            <p>
              No se ha designado Delegado de Protección de Datos al no concurrir ninguno de los supuestos
              previstos en el <strong className="text-[var(--color-cream)]">artículo 37 del RGPD</strong>:
              no somos autoridad pública, ni nuestras actividades principales requieren observación
              habitual y sistemática a gran escala de interesados, ni tratamos a gran escala categorías
              especiales de datos (art. 9 RGPD) o datos relativos a condenas e infracciones penales
              (art. 10 RGPD).
            </p>
            <p>
              Para cualquier cuestión relacionada con tus datos personales, puedes contactar directamente
              con el responsable del tratamiento a través del email{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>
              .
            </p>
          </Section>

          {/* 10. Menores */}
          <Section title="10. Menores de edad">
            <p>
              Este sitio web <strong className="text-[var(--color-cream)]">no está dirigido a menores de
              catorce (14) años</strong>, edad mínima legal para prestar consentimiento al tratamiento de
              datos personales según el artículo 7 de la LOPDGDD.
            </p>
            <p>
              Si eres padre, madre o tutor legal y has detectado que un menor a tu cargo ha proporcionado
              sus datos personales sin tu autorización, contacta inmediatamente con{' '}
              <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
                info@dcbikescantabria.es
              </a>{' '}
              para proceder a su supresión.
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
