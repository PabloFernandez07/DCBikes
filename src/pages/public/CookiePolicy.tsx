import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, Shield, BarChart2, Target, Trash2 } from 'lucide-react'

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

function CookieTable({
  rows,
}: {
  rows: { nombre: string; tipo: string; finalidad: string; duracion: string }[]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-card-hover)] mt-3">
      <table className="w-full text-xs font-[var(--font-body)]">
        <thead>
          <tr className="bg-[var(--color-card)] border-b border-[var(--color-card-hover)]">
            {['Nombre', 'Tipo', 'Finalidad', 'Duración'].map(h => (
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
              <td className="px-4 py-2.5 text-[var(--color-mid)]">{r.finalidad}</td>
              <td className="px-4 py-2.5 text-[var(--color-mid)] whitespace-nowrap">{r.duracion}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CookiePolicy() {
  const pageRef = useReveal()

  const resetConsent = () => {
    localStorage.removeItem('dcbikes_cookie_consent')
    window.location.reload()
  }

  return (
    <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="py-20">
        <p className="rv font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
          Legal
        </p>
        <h1 className="rv font-[var(--font-display)] text-7xl text-[var(--color-cream)] tracking-wide leading-none mb-6">
          POLÍTICA DE COOKIES
        </h1>
        <p className="rv text-[var(--color-mid)] font-[var(--font-body)] text-sm">
          Última actualización: abril de 2026
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
            (C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 Astillero, Cantabria), cómo y por qué, en cumplimiento del
            Reglamento General de Protección de Datos (RGPD/GDPR) y la Ley de Servicios de la Sociedad de la Información (LSSI).
          </p>
        </Section>

        {/* Tipos */}
        <Section title="Tipos de cookies que usamos">
          <div className="space-y-4 mt-2">
            {/* Esenciales */}
            <div className="flex gap-4 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <Shield size={18} className="text-green-400" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  Cookies esenciales — siempre activas
                </p>
                <p>
                  Imprescindibles para que la web funcione correctamente. Guardan tu sesión de administrador y tus
                  preferencias de cookies. No requieren tu consentimiento y no pueden desactivarse.
                </p>
                <CookieTable rows={[
                  { nombre: 'dcbikes_cookie_consent', tipo: 'Propia · Persistente', finalidad: 'Almacena tu elección de cookies', duracion: '12 meses' },
                  { nombre: 'sb-*', tipo: 'Propia · Sesión', finalidad: 'Sesión autenticada del panel de administración', duracion: 'Sesión' },
                ]} />
              </div>
            </div>

            {/* Analíticas */}
            <div className="flex gap-4 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-lavender)]/10 flex items-center justify-center shrink-0">
                <BarChart2 size={18} className="text-[var(--color-lavender)]" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  Cookies analíticas — requieren consentimiento
                </p>
                <p>
                  Nos permiten conocer qué productos visitan más los usuarios, qué términos se buscan y cómo mejorar
                  el catálogo. Los datos se almacenan en nuestra propia base de datos (Supabase) sin ceder información a terceros.
                </p>
                <CookieTable rows={[
                  { nombre: 'dcbikes_session', tipo: 'Propia · Sesión', finalidad: 'Identifica la sesión para registrar visitas a productos', duracion: 'Sesión' },
                ]} />
              </div>
            </div>

            {/* Marketing */}
            <div className="flex gap-4 p-4 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)]">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-brand-red)]/10 flex items-center justify-center shrink-0">
                <Target size={18} className="text-[var(--color-brand-red)]" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide mb-1">
                  Cookies de terceros — Google Maps
                </p>
                <p>
                  La página de contacto incluye un mapa de Google Maps. Si lo cargas, Google puede depositar sus propias cookies
                  para funcionar y para sus propios fines analíticos. Consulta la{' '}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-lavender)] underline underline-offset-2"
                  >
                    política de privacidad de Google
                  </a>.
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
            <a href="mailto:info@dcbikescantabria.es" className="text-[var(--color-lavender)] underline underline-offset-2">
              info@dcbikescantabria.es
            </a>{' '}
            o visítanos en C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 Astillero, Cantabria.
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
