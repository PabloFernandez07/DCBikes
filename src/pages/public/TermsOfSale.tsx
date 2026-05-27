import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SEO } from '@/components/layout/SEO'
import { supabase } from '@/lib/supabase'
import { useSchedule } from '@/hooks/useSchedule'
import { STORE_ADDRESS_FALLBACK } from '@/hooks/useStoreAddress'

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

/**
 * Lee los settings legales/comerciales relevantes para los términos de venta.
 * Si la key no existe o está vacía, devuelve null para que la UI muestre <Pending>.
 *
 * Nota: las keys `legal_company_name`, `legal_company_cif`, `legal_company_address`
 * se añadirán en Fase J. Por ahora caemos al fallback con las keys existentes
 * (`legal_nif`, `store_address`).
 */
function useSaleSettings() {
  const [s, setS] = useState<Record<string, string | null>>({})

  useEffect(() => {
    supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'legal_company_name',
        'legal_company_cif',
        'legal_company_address',
        'legal_nif',
        'legal_forma_juridica',
        'legal_inscripcion',
        'store_address',
        'store_phone',
        'quote_destination_email',
        'shipping_flat_rate',
        'shipping_free_threshold',
        'pickup_retention_days',
      ])
      .then(({ data }) => {
        const obj: Record<string, string | null> = {}
        for (const row of data ?? []) {
          try {
            const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
            obj[row.key] = v !== null && v !== undefined && String(v).trim() ? String(v) : null
          } catch {
            const v = row.value as unknown
            obj[row.key] = v !== null && v !== undefined && String(v).trim() ? String(v) : null
          }
        }
        setS(obj)
      })
  }, [])

  return s
}

export default function TermsOfSale() {
  const pageRef = useReveal()
  const s = useSaleSettings()
  const { schedule } = useSchedule()

  const companyName = s.legal_company_name ?? 'DC Bikes Cantabria'
  const cif = s.legal_company_cif ?? s.legal_nif ?? null
  const address =
    s.legal_company_address ?? s.store_address ?? STORE_ADDRESS_FALLBACK
  const phone = s.store_phone ?? null
  const email = s.quote_destination_email ?? 'info@dcbikescantabria.es'
  const pickupDays = s.pickup_retention_days ?? '15'

  return (
    <>
      <SEO
        title="Términos y condiciones de venta"
        description="Términos y condiciones generales de la venta online en DC Bikes Cantabria conforme a la LSSI-CE y al RDL 1/2007."
        url="https://dc-bikes-cantabria.vercel.app/terminos-venta"
      />

      <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="py-20">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Legal
          </p>
          <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6">
            TÉRMINOS DE VENTA
          </h1>
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            Última actualización: mayo de 2026
          </p>
        </section>

        <div className="w-full pb-24 space-y-12">

          {/* 1. Identificación del vendedor */}
          <Section title="1. Identificación del vendedor">
            <p>
              En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE) y del artículo 97 del Real Decreto
              Legislativo 1/2007 (Ley General Defensa Consumidores y Usuarios), se informa que el vendedor de los
              productos ofrecidos en este sitio web es:
            </p>
            <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] space-y-2">
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Denominación:</strong>{' '}
                <span className="text-[var(--color-cream)]">{companyName}</span>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">NIF / CIF:</strong>{' '}
                <Value value={cif} pendingLabel="pendiente — rellena en Admin → Configuración" />
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Forma jurídica:</strong>{' '}
                <Value value={s.legal_forma_juridica} pendingLabel="pendiente — p. ej. Autónomo / S.L." />
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Domicilio fiscal:</strong>{' '}
                <span className="text-[var(--color-cream)]">{address}</span>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Correo electrónico:</strong>{' '}
                <a href={`mailto:${email}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                  {email}
                </a>
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Teléfono:</strong>{' '}
                {phone ? (
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                    {phone}
                  </a>
                ) : (
                  <Pending label="pendiente — rellena 'Teléfono' en Admin → Configuración" />
                )}
              </p>
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Inscripción registral:</strong>{' '}
                <Value value={s.legal_inscripcion} pendingLabel="pendiente — Registro Mercantil, o 'No aplica' si autónomo" />
              </p>
            </div>
          </Section>

          {/* 2. Objeto */}
          <Section title="2. Objeto y aceptación">
            <p>
              Al realizar un pedido en este sitio web, el cliente declara{' '}
              <strong className="text-[var(--color-cream)]">ser mayor de 18 años</strong> o, en caso de ser
              menor de edad, contar con la <strong className="text-[var(--color-cream)]">autorización expresa
              de su representante legal</strong>. Los pedidos realizados por menores sin dicha autorización
              podrán ser cancelados sin previo aviso (artículo 1263 del Código Civil y artículo 28 del Real
              Decreto Legislativo 1/2007 de Defensa de Consumidores y Usuarios).
            </p>
            <p>
              Las presentes condiciones generales regulan la venta de los productos ofrecidos por {companyName}{' '}
              a través del sitio web <strong className="text-[var(--color-cream)]">dcbikescantabria.es</strong>.
              La realización de un pedido implica la aceptación expresa y sin reservas de las presentes condiciones.
            </p>
            <p>
              El cliente declara, asimismo, disponer de la capacidad legal necesaria para contratar.
            </p>
          </Section>

          {/* 3. Productos */}
          <Section title="3. Productos, precios y disponibilidad">
            <p>
              A través de la tienda online se comercializan <strong className="text-[var(--color-cream)]">ropa,
              cascos, calzado y accesorios</strong> para ciclismo. Las bicicletas no se venden online: se ofrecen
              exclusivamente en la tienda física de El Astillero.
            </p>
            <p>
              Todos los precios se muestran <strong className="text-[var(--color-cream)]">en euros con el IVA
              incluido</strong> (PVP). Los gastos de envío se calculan y muestran de forma separada en el checkout
              antes de finalizar la compra.
            </p>
            <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                Revisión y aceptación del pedido por la tienda
              </p>
              <p>
                Su pedido se considerará en firme una vez aceptado expresamente por {companyName}. Disponemos de un
                plazo máximo de <strong className="text-[var(--color-cream)]">48 horas</strong> desde la realización
                del pedido para confirmar o rechazar la disponibilidad. Si rechazamos el pedido, la
                pre-autorización del pago se libera automáticamente sin coste alguno para el cliente.
              </p>
            </div>
            <p className="text-xs">
              {companyName} se reserva el derecho a modificar precios y catálogo en cualquier momento. El precio
              aplicable será siempre el vigente en el momento de realizar el pedido.
            </p>
          </Section>

          {/* 4. Proceso de compra */}
          <Section title="4. Proceso de compra">
            <ol className="list-decimal list-inside space-y-2 pl-2">
              <li>El cliente añade productos al carrito y accede al checkout.</li>
              <li>Cumplimenta sus datos personales y de envío, y selecciona el método de pago.</li>
              <li>
                Al confirmar el pago, Redsys realiza una{' '}
                <strong className="text-[var(--color-cream)]">pre-autorización</strong> sobre la tarjeta del cliente
                (el importe queda retenido, pero no se carga efectivamente).
              </li>
              <li>Recibirá un correo de confirmación inmediato con el detalle del pedido.</li>
              <li>
                En un plazo máximo de 48 h, {companyName} confirmará la disponibilidad y procederá al cobro
                definitivo (captura), o bien rechazará el pedido y liberará la pre-autorización.
              </li>
              <li>Una vez aceptado, se enviará por correo electrónico la <strong className="text-[var(--color-cream)]">factura en PDF</strong>.</li>
              <li>Se procederá a preparar y enviar el pedido (o a notificar que está listo para recoger en tienda).</li>
            </ol>
          </Section>

          {/* 5. Medios de pago */}
          <Section title="5. Medios de pago">
            <p>
              Aceptamos los siguientes medios de pago a través de la pasarela segura{' '}
              <strong className="text-[var(--color-cream)]">Redsys</strong> (Servired Sistemas de Procesamiento, S.A.),
              entidad líder en procesamiento de pagos en España:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Tarjeta bancaria</strong> Visa y Mastercard (crédito y débito).</li>
              <li><strong className="text-[var(--color-cream)]">Bizum</strong> (sujeto a activación por la entidad bancaria).</li>
            </ul>
            <p className="text-xs">
              Las transacciones se realizan en un entorno cifrado bajo el estándar de seguridad PCI-DSS.{' '}
              {companyName} no almacena ni tiene acceso en ningún momento a los datos completos de su tarjeta.
            </p>
          </Section>

          {/* 6. Envíos */}
          <Section title="6. Envíos">
            <p>
              Realizamos envíos únicamente a <strong className="text-[var(--color-cream)]">Península y
              Cantabria</strong>. No realizamos envíos a Baleares, Canarias, Ceuta, Melilla ni territorios fuera del
              ámbito peninsular.
            </p>
            <p>
              El coste de envío se calcula en el checkout en función de la dirección de entrega. Los pedidos
              superiores a un determinado importe disfrutan de envío gratuito; el umbral y la tarifa plana se
              indican claramente antes de confirmar la compra.
              {s.shipping_flat_rate && (
                <> Tarifa plana actual: <strong className="text-[var(--color-cream)]">{s.shipping_flat_rate}€</strong>.</>
              )}
              {s.shipping_free_threshold && (
                <> Envío gratuito a partir de <strong className="text-[var(--color-cream)]">{s.shipping_free_threshold}€</strong>.</>
              )}
            </p>
            <p>
              El plazo de entrega habitual, una vez aceptado el pedido por la tienda, es de{' '}
              <strong className="text-[var(--color-cream)]">2 a 5 días laborables</strong> dentro de Península.
              Estos plazos son orientativos y pueden variar en función de la disponibilidad del transportista.
            </p>
          </Section>

          {/* 7. Recogida en tienda */}
          <Section title="7. Recogida en tienda">
            <p>
              Como alternativa al envío a domicilio, ofrecemos la opción de{' '}
              <strong className="text-[var(--color-cream)]">recoger gratuitamente</strong> el pedido en nuestra
              tienda física:
            </p>
            <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] space-y-2">
              <p>
                <strong className="text-[var(--color-cream)] font-[var(--font-cond)]">Dirección:</strong>{' '}
                <span className="text-[var(--color-cream)]">{address}</span>
              </p>
              <div>
                <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">Horario:</p>
                <ul className="text-xs space-y-0.5 text-[var(--color-mid)]">
                  {schedule.map(d => {
                    const closed = !d.morning && !d.afternoon
                    return (
                      <li key={d.label}>
                        <span className="text-[var(--color-cream-dim)] font-[var(--font-cond)]">{d.label}:</span>{' '}
                        {closed ? 'Cerrado' : [d.morning, d.afternoon].filter(Boolean).join(' · ')}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
            <p>
              Una vez recibido el aviso de «listo para recoger», el cliente dispone de un plazo de{' '}
              <strong className="text-[var(--color-cream)]">{pickupDays} días naturales</strong> para acercarse a la
              tienda. Transcurrido dicho plazo sin retirar el pedido, contactaremos para acordar una solución
              (reenvío, prórroga o cancelación con reembolso).
            </p>
          </Section>

          {/* 8. Garantía */}
          <Section title="8. Garantía legal">
            <p>
              Todos los productos comercializados disponen de la{' '}
              <strong className="text-[var(--color-cream)]">garantía legal de 3 años</strong> por falta de
              conformidad establecida en los artículos 114 y siguientes del RDL 1/2007 (texto reformado por el RDL
              7/2021, vigente desde el 1 de enero de 2022).
            </p>
            <p>
              Para más información sobre cómo ejercer la garantía o sobre devoluciones, consulta nuestra{' '}
              <Link to="/devoluciones" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de devoluciones
              </Link>
              .
            </p>
          </Section>

          {/* 9. Desistimiento */}
          <Section title="9. Derecho de desistimiento">
            <p>
              Conforme al artículo 102 del RDL 1/2007, el cliente dispone de un plazo de{' '}
              <strong className="text-[var(--color-cream)]">14 días naturales</strong> desde la recepción del
              producto para desistir del contrato sin necesidad de justificación.
            </p>
            <p>
              El procedimiento detallado, las excepciones aplicables y el formulario oficial descargable están
              disponibles en nuestra{' '}
              <Link to="/devoluciones" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de devoluciones
              </Link>
              .
            </p>
          </Section>

          {/* 10. Resolución de conflictos */}
          <Section title="10. Resolución de conflictos">
            <p>
              Conforme al artículo 14 del Reglamento (UE) nº 524/2013, informamos al cliente de la existencia de la{' '}
              <strong className="text-[var(--color-cream)]">Plataforma europea de resolución de litigios en línea (ODR)</strong>{' '}
              de la Comisión Europea:{' '}
              <a
                href="https://ec.europa.eu/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2 break-all"
              >
                https://ec.europa.eu/odr
              </a>
            </p>
            <p>
              <strong className="text-[var(--color-cream)]">{companyName} no está actualmente adherido al Sistema
              Arbitral de Consumo</strong>. Sin perjuicio de ello, el cliente puede ejercer sus derechos ante la{' '}
              <a
                href="https://www.cantabria.es/web/direccion-general-consumo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                Dirección General de Consumo del Gobierno de Cantabria
              </a>{' '}
              y/o utilizar la plataforma europea de resolución de litigios en línea (ODR) mencionada anteriormente.
            </p>
            <p className="text-xs">
              Conforme al artículo 90 del RDL 1/2007, se consideran abusivas las cláusulas que impongan al
              consumidor someterse a una jurisdicción distinta de la que corresponda a su domicilio o al lugar de
              cumplimiento de la obligación. En consecuencia, serán competentes los Juzgados y Tribunales del
              domicilio del consumidor.
            </p>
          </Section>

          {/* 11. Protección de datos */}
          <Section title="11. Protección de datos">
            <p>
              El tratamiento de los datos personales facilitados por el cliente para gestionar el pedido se realiza
              conforme al RGPD y la LOPDGDD. Toda la información se encuentra disponible en la{' '}
              <Link to="/privacidad" className="text-[var(--color-lavender)] underline underline-offset-2">
                Política de privacidad
              </Link>
              .
            </p>
          </Section>

          {/* 12. Modificaciones */}
          <Section title="12. Modificaciones">
            <p>
              {companyName} se reserva el derecho de modificar las presentes condiciones generales para adaptarlas
              a la normativa vigente o por motivos operativos. En cualquier caso, será de aplicación a cada pedido
              la versión de los términos vigente en el momento de la formalización de la compra.
            </p>
          </Section>

          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-xs">
            Si tienes cualquier duda sobre estos términos,{' '}
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
