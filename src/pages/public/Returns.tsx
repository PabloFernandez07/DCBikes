import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, AlertTriangle, Clock, Euro, Package, Shield, Scale } from 'lucide-react'
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
 * Lee el email de contacto desde settings. Fallback a info@dcbikes.es si
 * la key no existe todavía o está vacía.
 */
function useContactEmail() {
  const [email, setEmail] = useState<string>('info@dcbikes.es')
  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'quote_destination_email')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return
        try {
          const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
          if (v && String(v).trim()) setEmail(String(v).trim())
        } catch {
          if (data.value && String(data.value).trim()) setEmail(String(data.value).trim())
        }
      })
  }, [])
  return email
}

export default function Returns() {
  const pageRef = useReveal()
  const contactEmail = useContactEmail()

  return (
    <>
      <SEO
        title="Política de devoluciones"
        description="Información sobre el derecho de desistimiento, devoluciones y garantía conforme al Real Decreto Legislativo 1/2007 (Ley General Defensa Consumidores y Usuarios)."
        url="https://dc-bikes-cantabria.vercel.app/devoluciones"
      />

      <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="py-20">
          <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Legal
          </p>
          <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6">
            DEVOLUCIONES
          </h1>
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
            Última actualización: mayo de 2026
          </p>
        </section>

        <div className="w-full pb-24 space-y-12">

          {/* Intro */}
          <Section title="1. Tu derecho de desistimiento">
            <p>
              Conforme al artículo 102 del{' '}
              <strong className="text-[var(--color-cream)]">Real Decreto Legislativo 1/2007</strong> (Ley General
              para la Defensa de los Consumidores y Usuarios), dispones de un plazo de{' '}
              <strong className="text-[var(--color-cream)]">14 días naturales</strong> desde la recepción del
              producto para desistir del contrato sin necesidad de justificar tu decisión y sin penalización alguna.
            </p>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <Clock size={20} className="text-[var(--color-lavender)] shrink-0 mt-0.5" />
              <p className="text-[var(--color-cream-dim)]">
                El plazo de 14 días comienza el día en que tú o un tercero designado (distinto del transportista)
                adquiere la posesión material del producto.
              </p>
            </div>
          </Section>

          {/* 2. Cómo ejercerlo */}
          <Section title="2. Cómo ejercer el desistimiento">
            <p>
              Para ejercer el derecho de desistimiento debes notificárnoslo mediante una declaración inequívoca
              (por ejemplo, carta postal o correo electrónico) antes de que finalice el plazo de 14 días naturales.
              Tienes dos opciones:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {/* Opción A — formulario oficial */}
              <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-lavender)]/10 flex items-center justify-center">
                    <FileText size={18} className="text-[var(--color-lavender)]" />
                  </div>
                  <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                    Formulario oficial UE
                  </p>
                </div>
                <p className="text-[var(--color-mid)] text-sm">
                  Descarga el formulario normalizado conforme al Anexo B de la Directiva 2011/83/UE, complétalo y
                  envíanoslo.
                </p>
                <a
                  href="/devoluciones-formulario.pdf"
                  download
                  className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-lavender)]/10 border border-[var(--color-lavender)]/40 text-[var(--color-lavender)] text-sm font-[var(--font-cond)] tracking-wide hover:bg-[var(--color-lavender)]/20 transition-colors"
                >
                  <Download size={14} />
                  Descargar formulario (PDF)
                </a>
              </div>

              {/* Opción B — email libre */}
              <div className="p-5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-brand-red)]/10 flex items-center justify-center">
                    <Package size={18} className="text-[var(--color-brand-red)]" />
                  </div>
                  <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                    Correo electrónico
                  </p>
                </div>
                <p className="text-[var(--color-mid)] text-sm">
                  Escríbenos a{' '}
                  <a href={`mailto:${contactEmail}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                    {contactEmail}
                  </a>{' '}
                  indicando:
                </p>
                <ul className="list-disc list-inside text-xs text-[var(--color-mid)] space-y-0.5 pl-1">
                  <li>Tu nombre y dirección</li>
                  <li>Número de pedido</li>
                  <li>Producto(s) a devolver</li>
                  <li>Motivo (opcional)</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* 3. Plazo reembolso */}
          <Section title="3. Plazo de reembolso">
            <p>
              Te reembolsaremos el importe íntegro abonado por los productos devueltos, incluidos los gastos de
              envío estándar (excepto los costes adicionales derivados de tu elección de una modalidad de envío
              distinta a la más barata ofrecida), en un plazo máximo de{' '}
              <strong className="text-[var(--color-cream)]">14 días naturales</strong> desde la fecha en que nos
              comuniques tu decisión de desistir.
            </p>
            <p>
              No obstante, podremos retener el reembolso hasta haber recibido los productos o hasta que presentes
              prueba de su devolución (lo que ocurra primero), conforme al art. 76 RDL 1/2007.
            </p>
            <p>
              El reembolso se realizará por el <strong className="text-[var(--color-cream)]">mismo medio de pago</strong>{' '}
              utilizado en la compra original, salvo que expresamente acuerdes otra cosa. En ningún caso te
              repercutiremos gastos como consecuencia del reembolso.
            </p>
          </Section>

          {/* 4. Estado del producto */}
          <Section title="4. Estado en el que debe devolverse el producto">
            <p>
              Para que aceptemos la devolución, el producto debe encontrarse en su estado original:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-[var(--color-cream)]">Sin uso</strong>, salvo la manipulación imprescindible para comprobar la naturaleza, características y funcionamiento del producto.</li>
              <li>Con su <strong className="text-[var(--color-cream)]">embalaje original</strong> en buen estado.</li>
              <li>Con todas sus <strong className="text-[var(--color-cream)]">etiquetas y accesorios</strong> originales.</li>
              <li>Acompañado del comprobante de compra o número de pedido.</li>
            </ul>
            <p className="text-xs text-[var(--color-mid)]">
              Conforme al art. 108 RDL 1/2007, podrás ser responsable de la disminución de valor de los bienes
              resultante de una manipulación distinta a la necesaria para establecer su naturaleza, características o
              funcionamiento.
            </p>
          </Section>

          {/* 5. Excepciones */}
          <Section title="5. Excepciones al derecho de desistimiento">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/30">
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[var(--color-cream-dim)]">
                Conforme al artículo 103 del RDL 1/2007, <strong className="text-[var(--color-cream)]">no procede
                el derecho de desistimiento</strong> en los siguientes casos:
              </p>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Productos <strong className="text-[var(--color-cream)]">confeccionados conforme a tus especificaciones</strong> o claramente personalizados.</li>
              <li>Productos precintados por razones de <strong className="text-[var(--color-cream)]">protección de la salud o higiene</strong> que hayan sido desprecintados tras la entrega (p. ej. bidones bebidos, productos íntimos desprecintados).</li>
              <li>Productos que, tras su entrega y según su naturaleza, se hayan <strong className="text-[var(--color-cream)]">mezclado de forma indisociable</strong> con otros bienes.</li>
              <li>Servicios <strong className="text-[var(--color-cream)]">ya prestados completamente</strong> cuando la ejecución se haya iniciado con tu consentimiento expreso previo.</li>
              <li>Grabaciones sonoras, vídeo o programas informáticos precintados que hayan sido desprecintados después de la entrega.</li>
            </ul>
            <p className="text-[var(--color-cream-dim)] text-sm">
              <strong className="text-[var(--color-cream)]">Bicicletas personalizadas:</strong>{' '}
              no procede el derecho de desistimiento sobre bicicletas montadas a medida del cliente
              (talla de cuadro, manillar, sillín, transmisión y componentes seleccionados expresamente)
              conforme al art. 103.c RDL 1/2007. Estas ventas se formalizan en tienda presencial con
              presupuesto firmado y entrega tras aceptación expresa por escrito.
            </p>
          </Section>

          {/* 6. Quién paga el porte */}
          <Section title="6. Costes de devolución">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] flex gap-3">
                <Euro size={20} className="text-[var(--color-cream-dim)] shrink-0 mt-0.5" />
                <div>
                  <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                    Desistimiento ordinario
                  </p>
                  <p>
                    Los <strong className="text-[var(--color-cream)]">gastos de envío de la devolución corren a tu cargo</strong> (art. 108.1 RDL 1/2007).
                  </p>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] flex gap-3">
                <Package size={20} className="text-[var(--color-lavender)] shrink-0 mt-0.5" />
                <div>
                  <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                    Producto defectuoso o erróneo
                  </p>
                  <p>
                    Si el producto llega <strong className="text-[var(--color-cream)]">defectuoso o no se corresponde</strong> con tu pedido, los gastos de devolución corren íntegramente por nuestra cuenta.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* 7. Garantía */}
          <Section title="7. Garantía legal por falta de conformidad">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <Shield size={20} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                  3 años de garantía
                </p>
                <p className="text-[var(--color-mid)]">
                  Tras la reforma del RDL 1/2007 por el RDL 7/2021 (vigente desde el 1 de enero de 2022), los
                  productos nuevos disponen de una garantía legal por falta de conformidad de{' '}
                  <strong className="text-[var(--color-cream)]">3 años</strong> desde la entrega.
                </p>
              </div>
            </div>
            <p>
              Si el producto presenta una falta de conformidad, tendrás derecho a la puesta en conformidad mediante
              reparación o sustitución, a la reducción del precio o, en su caso, a la resolución del contrato
              conforme a los artículos 117 y siguientes del RDL 1/2007.
            </p>
            <p>
              Para hacer efectiva la garantía, contacta con nosotros en{' '}
              <a href={`mailto:${contactEmail}`} className="text-[var(--color-lavender)] underline underline-offset-2">
                {contactEmail}
              </a>{' '}
              adjuntando comprobante de compra y descripción del defecto.
            </p>
          </Section>

          {/* 8. ODR */}
          <Section title="8. Resolución alternativa de litigios">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <Scale size={20} className="text-[var(--color-lavender)] shrink-0 mt-0.5" />
              <div>
                <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                  Plataforma europea de resolución de litigios en línea (ODR)
                </p>
                <p className="text-[var(--color-mid)]">
                  Conforme al artículo 14 del Reglamento (UE) nº 524/2013, te informamos de que la Comisión Europea
                  facilita una plataforma de resolución de litigios en línea disponible en el siguiente enlace:
                </p>
              </div>
            </div>
            <p>
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2 break-all"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
            </p>
            <p>
              Como consumidor también puedes dirigir tus reclamaciones a la{' '}
              <a
                href="https://www.cantabria.es/web/direccion-general-consumo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                Dirección General de Consumo del Gobierno de Cantabria
              </a>{' '}
              o a la Junta Arbitral de Consumo competente.
            </p>
          </Section>

          {/* Final note */}
          <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-xs">
            Esta política se complementa con los{' '}
            <Link to="/terminos-venta" className="text-[var(--color-lavender)] underline underline-offset-2">
              Términos de venta
            </Link>
            , la{' '}
            <Link to="/privacidad" className="text-[var(--color-lavender)] underline underline-offset-2">
              Política de privacidad
            </Link>{' '}
            y el{' '}
            <Link to="/aviso-legal" className="text-[var(--color-lavender)] underline underline-offset-2">
              Aviso legal
            </Link>
            . Si tienes cualquier duda,{' '}
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
