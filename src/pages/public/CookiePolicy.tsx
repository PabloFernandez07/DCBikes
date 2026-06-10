import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, Shield, BarChart2, Target, Trash2, Image } from 'lucide-react'
import { useStoreAddress } from '@/hooks/useStoreAddress'
import { useLegalIdentity } from '@/hooks/useLegalIdentity'
import { COOKIES_VERSION } from '@/lib/legal-versions'

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
      <h2 className="font-[var(--font-display)] text-xl md:text-2xl text-[var(--color-cream)] tracking-widest mb-4">
        {title}
      </h2>
      <div className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

function CookieTable({
  rows,
}: {
  rows: { nombre: string; tipo: string; titular?: string; finalidad: string; duracion: string }[]
}) {
  const hasTitular = rows.some(r => r.titular)
  const headers = hasTitular
    ? ['Identificador', 'Tipo', 'Titular', 'Duración', 'Finalidad']
    : ['Identificador', 'Tipo', 'Finalidad', 'Duración']
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-card-hover)] mt-3">
      <table className="w-full text-xs font-[var(--font-body)]">
        <thead>
          <tr className="bg-[var(--color-card)] border-b border-[var(--color-card-hover)]">
            {headers.map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--color-card-hover)]/40 last:border-0 hover:bg-[var(--color-card)]/30">
              <td className="px-4 py-2.5 text-[var(--color-cream)] font-mono">{r.nombre}</td>
              <td className="px-4 py-2.5 text-[var(--color-cream-dim)]">{r.tipo}</td>
              {hasTitular && (
                <td className="px-4 py-2.5 text-[var(--color-mid)]">{r.titular ?? '—'}</td>
              )}
              {hasTitular ? (
                <>
                  <td className="px-4 py-2.5 text-[var(--color-mid)] whitespace-nowrap">{r.duracion}</td>
                  <td className="px-4 py-2.5 text-[var(--color-mid)]">{r.finalidad}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-2.5 text-[var(--color-mid)]">{r.finalidad}</td>
                  <td className="px-4 py-2.5 text-[var(--color-mid)] whitespace-nowrap">{r.duracion}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CookiePolicy() {
  const pageRef = useReveal()
  const storeAddress = useStoreAddress()
  const legal = useLegalIdentity()
  const contactEmail = legal?.contactEmail ?? 'info@dcbikescantabria.com'

  const resetConsent = () => {
    if (!confirm('Esto recargará la página y borrará tu preferencia de cookies. ¿Continuar?')) return
    localStorage.removeItem('dcbikes_cookie_consent')
    window.location.reload()
  }

  return (
    <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="py-12 md:py-20">
        <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
          Legal
        </p>
        <h1 className="rv font-[var(--font-display)] text-5xl md:text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6 break-words">
          POLÍTICA DE COOKIES
        </h1>
        <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
          Última actualización: {COOKIES_VERSION}
        </p>
      </section>

      <div className="w-full pb-24 space-y-12">
        {/* Intro */}
        <Section title="¿Qué son las cookies?">
          <p>
            Las cookies son pequeños archivos de texto que los sitios web depositan en tu navegador cuando los visitas.
            Sirven para recordar tus preferencias, analizar cómo se usa la web y, en algunos casos, mostrar publicidad relevante.
          </p>
          <p>
            Esta política explica qué cookies utiliza <strong className="text-[var(--color-cream)]">DC Bikes Cantabria</strong>{' '}
            ({storeAddress}), cómo y por qué, en cumplimiento del
            Reglamento General de Protección de Datos (RGPD/GDPR) y la Ley de Servicios de la Sociedad de la Información (LSSI).
          </p>
        </Section>

        {/* Tipos */}
        <Section title="Tipos de cookies y almacenamiento que usamos">
          <p>
            A continuación detallamos el inventario completo de cookies, <code className="text-[var(--color-lavender)]">localStorage</code>{' '}
            y <code className="text-[var(--color-lavender)]">sessionStorage</code> empleados por este sitio web,
            agrupados en cuatro categorías según su finalidad y régimen jurídico.
          </p>

          <div className="space-y-4 mt-2">
            {/* A. Técnicas estrictamente necesarias */}
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  A. Cookies y almacenamiento técnicos estrictamente necesarios
                </p>
                <p>
                  Imprescindibles para el funcionamiento del sitio. <strong className="text-[var(--color-cream)]">No
                  requieren consentimiento</strong> al estar amparados por el artículo 22.2 de la Ley 34/2002
                  (LSSI-CE).
                </p>
                <CookieTable rows={[
                  { nombre: 'dcbikes_cookie_consent', tipo: 'localStorage', titular: 'Propia', duracion: '12 meses', finalidad: 'Almacena tu elección sobre cookies' },
                  { nombre: 'dcbikes_pending_order', tipo: 'localStorage', titular: 'Propia', duracion: 'Sesión', finalidad: 'Persiste el pedido durante el proceso de checkout' },
                  { nombre: 'dcbikes_last_order', tipo: 'localStorage', titular: 'Propia', duracion: '30 días', finalidad: 'Token técnico para recuperar tu último pedido sin tener que solicitar magic link cada vez. Duración 30 días: equilibra comodidad con minimización de datos (art. 5.1.c RGPD). Se borra al cerrar sesión o desde la configuración del navegador.' /* P-08 auditoría V3: justifica duración 30d */ },
                  { nombre: 'dcbikes_customer_session', tipo: 'localStorage', titular: 'Propia', duracion: '24 horas', finalidad: 'Token temporal de "Mis pedidos" (magic link)' },
                  { nombre: 'cart-store', tipo: 'localStorage', titular: 'Propia', duracion: 'Indefinida hasta vaciado', finalidad: 'Mantiene tu carrito de compra entre sesiones' },
                  { nombre: 'dcb_session', tipo: 'sessionStorage', titular: 'Propia', duracion: 'Sesión', finalidad: 'Identificador de sesión para analítica anónima' },
                  { nombre: 'dcb_groupings_confirmed', tipo: 'localStorage', titular: 'Propia', duracion: 'Indefinida', finalidad: 'Uso exclusivo del panel administrativo' },
                  { nombre: 'sb-*', tipo: 'localStorage', titular: 'Propia (Supabase Auth)', duracion: 'Sesión administrativa', finalidad: 'Autenticación del administrador de la tienda' },
                  // P-04: Cloudflare Turnstile — técnicas imprescindibles, exentas de consentimiento (art. 22.2 LSSI)
                  { nombre: '__cf_bm', tipo: 'Cookie HTTP', titular: 'Cloudflare, Inc.', duracion: '30 min (sesión)', finalidad: 'Filtro de bots — Cloudflare Bot Management. Prevención de fraude en formularios de contacto y presupuesto.' },
                  { nombre: 'cf_clearance', tipo: 'Cookie HTTP', titular: 'Cloudflare, Inc.', duracion: '30 días', finalidad: 'Validación de retos de seguridad superados. Técnica imprescindible (art. 22.2 LSSI).' },
                ]} />
              </div>
            </div>

            {/* B. Terceros funcionales */}
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-lavender)]/10 flex items-center justify-center shrink-0">
                <Target size={18} className="text-[var(--color-lavender)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  B. Cookies de terceros funcionales — requieren consentimiento
                </p>
                <ul className="list-disc list-inside space-y-2 pl-2">
                  <li>
                    <strong className="text-[var(--color-cream)]">Google Maps</strong> (Google LLC, EE.&nbsp;UU.)
                    — finalidad: mostrar el mapa de localización de la tienda en la página de contacto. Cookies
                    habituales que Google deposita al cargar el iframe de Maps:
                    <CookieTable rows={[
                      { nombre: 'NID', tipo: 'Cookie HTTP', titular: 'Google LLC', duracion: '~6 meses', finalidad: 'Preferencias de usuario en servicios Google (idioma, resultados, mapas)' },
                      { nombre: '1P_JAR', tipo: 'Cookie HTTP', titular: 'Google LLC', duracion: '~1 mes', finalidad: 'Estadísticas y métricas agregadas de servicios Google' },
                      { nombre: 'CONSENT', tipo: 'Cookie HTTP', titular: 'Google LLC', duracion: 'Indefinida', finalidad: 'Gestión del estado de consentimiento del usuario en servicios Google' },
                      { nombre: '__Secure-3PSIDCC', tipo: 'Cookie HTTP', titular: 'Google LLC', duracion: '~1 año', finalidad: 'Anti-fraude y protección frente a usos abusivos de servicios Google' },
                    ]} />
                    <p className="mt-2">
                      Consulta la{' '}
                      <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-lavender)] underline underline-offset-2"
                      >
                        política de privacidad de Google
                      </a>{' '}
                      para el detalle actualizado. Las transferencias internacionales a EE.&nbsp;UU. se amparan en
                      el marco Data Privacy Framework (DPF).
                    </p>
                  </li>
                  <li>
                    <strong className="text-[var(--color-cream)]">Redsys</strong> durante la pasarela de pago
                    — gestionadas íntegramente por Redsys Servicios de Procesamiento, S.L. desde su propio dominio
                    (sis.redsys.es). Al tratarse de cookies estrictamente necesarias para procesar el pago
                    solicitado expresamente por el usuario, están{' '}
                    <strong className="text-[var(--color-cream)]">exentas de consentimiento previo</strong> conforme
                    al artículo 22.2 de la Ley 34/2002 (LSSI-CE). Más información en la{' '}
                    <a
                      href="https://www.redsys.es/politica-de-privacidad.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-lavender)] underline underline-offset-2"
                    >
                      política de privacidad de Redsys
                    </a>.
                  </li>
                </ul>
              </div>
            </div>

            {/* C. Analíticas */}
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-lavender)]/10 flex items-center justify-center shrink-0">
                <BarChart2 size={18} className="text-[var(--color-lavender)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  C. Cookies analíticas — requieren consentimiento previo
                </p>
                <p>
                  Actualmente <strong className="text-[var(--color-cream)]">no</strong> se utilizan cookies
                  analíticas de terceros (Google Analytics, Hotjar, Matomo, etc.). La analítica interna se
                  realiza mediante <code className="text-[var(--color-lavender)]">dcb_session</code>, que es
                  un identificador anónimo de sesión almacenado en{' '}
                  <code className="text-[var(--color-lavender)]">sessionStorage</code> y descrito en la
                  categoría A.
                </p>
              </div>
            </div>

            {/* D. Marketing */}
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-brand-red)]/10 flex items-center justify-center shrink-0">
                <Target size={18} className="text-[var(--color-brand-red)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  D. Cookies de marketing y publicidad
                </p>
                <p>
                  Actualmente <strong className="text-[var(--color-cream)]">no</strong> se utilizan cookies de
                  marketing ni publicidad de terceros (Facebook Pixel, TikTok Pixel, Google Ads, etc.). Si en
                  el futuro se implementan, esta política se actualizará y se solicitará tu{' '}
                  <strong className="text-[var(--color-cream)]">consentimiento previo expreso</strong> mediante
                  el banner de cookies antes de su activación.
                </p>
              </div>
            </div>

            {/* E. Imágenes de Google */}
            <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Image size={18} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  E. Imágenes de Google (avatares de reseñas) — sin cookies
                </p>
                <p>
                  En la sección de reseñas mostramos las fotos de perfil de los autores obtenidas de Google.{' '}
                  <strong className="text-[var(--color-cream)]">No instalamos ninguna cookie</strong> ni enviamos tu
                  dirección IP a Google: las imágenes se descargan a través de un proxy alojado en nuestros servidores
                  (dominio <code className="text-[var(--color-lavender)]">supabase.co</code>), por lo que Google no
                  recibe ningún dato de navegación tuyo al ver estas fotografías.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Base legal */}
        <Section title="Base legal">
          <p>
            El tratamiento de datos a través de cookies analíticas se basa en tu <strong className="text-[var(--color-cream)]">consentimiento expreso</strong>{' '}
            (art. 6.1.a RGPD), que puedes retirar en cualquier momento. Las cookies esenciales se amparan en el{' '}
            <strong className="text-[var(--color-cream)]">interés legítimo</strong> del responsable para mantener el funcionamiento
            básico del sitio (Considerando 47 RGPD).
          </p>
        </Section>

        {/* Tus derechos */}
        <Section title="Tus derechos">
          <p>
            De acuerdo con el RGPD y la Ley Orgánica 3/2018 (LOPDGDD) tienes derecho a acceder, rectificar, suprimir,
            oponerte y solicitar la portabilidad de tus datos. Para ejercerlos escríbenos a{' '}
            <a href={`mailto:${contactEmail}`} className="text-[var(--color-lavender)] underline underline-offset-2">
              {contactEmail}
            </a>{' '}
            o visítanos en {storeAddress}.
          </p>
          <p>
            También puedes presentar una reclamación ante la{' '}
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

        {/* Cómo desactivar */}
        <Section title="Cómo gestionar las cookies en tu navegador">
          <p>
            Puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que desactivar ciertas cookies
            puede afectar al funcionamiento de la web:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-[var(--color-lavender)] underline underline-offset-2">Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/es/kb/cookies-informacion-que-los-sitios-web-guardan-en-" target="_blank" rel="noopener noreferrer" className="text-[var(--color-lavender)] underline underline-offset-2">Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-[var(--color-lavender)] underline underline-offset-2">Safari</a></li>
            <li><a href="https://support.microsoft.com/es-es/microsoft-edge/eliminar-las-cookies-en-microsoft-edge-63947406" target="_blank" rel="noopener noreferrer" className="text-[var(--color-lavender)] underline underline-offset-2">Microsoft Edge</a></li>
          </ul>
        </Section>

        {/* Retirar consentimiento */}
        <section className="rv p-5 rounded-2xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-brand-red)]/10 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-[var(--color-brand-red)]" />
            </div>
            <div className="flex-1">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                Retirar o cambiar tu consentimiento
              </p>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed mb-3">
                Puedes retirar o modificar tu consentimiento en cualquier momento. Al pulsar el botón se eliminará
                tu elección guardada y volverá a aparecer el panel de cookies.
              </p>
              <button
                type="button"
                onClick={resetConsent}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-brand-red)]/40 text-[var(--color-brand-red)] text-sm font-[var(--font-cond)] tracking-wide hover:bg-[var(--color-brand-red)]/10 transition-colors"
              >
                <Cookie size={14} />
                Restablecer preferencias de cookies
              </button>
            </div>
          </div>
        </section>

        <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-xs">
          Nos reservamos el derecho a modificar esta política para adaptarla a cambios legislativos o técnicos.
          Cualquier cambio relevante será notificado mediante el banner de cookies.{' '}
          <Link to="/contacto" className="text-[var(--color-lavender)] underline underline-offset-2">
            Contacta con nosotros
          </Link>{' '}
          si tienes dudas.
        </p>
      </div>
    </div>
  )
}
