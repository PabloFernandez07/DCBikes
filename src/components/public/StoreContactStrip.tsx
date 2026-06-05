import { Link } from 'react-router-dom'
import { MapPin, Phone, Clock, ArrowRight } from 'lucide-react'

/**
 * Bloque de contacto local (NAP: Nombre · Dirección · Teléfono + horario).
 * Se incluye al pie de las landings de SEO para reforzar la señal de negocio
 * local de forma coherente en todas las páginas. Los datos coinciden con el
 * schema BicycleStore del prerender (fuente única de verdad para SEO).
 */
export function StoreContactStrip() {
  return (
    <section className="py-12 md:py-16" aria-label="Datos de contacto de la tienda">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[var(--color-card-hover)] bg-[var(--color-card)] p-6 sm:p-8 md:p-10">
          <div className="text-center mb-7 md:mb-8">
            <p className="font-[var(--font-cond)] text-[var(--color-lavender)] tracking-[0.3em] uppercase text-xs mb-2">
              Tu tienda de bicicletas de confianza
            </p>
            <h2 className="font-[var(--font-display)] text-3xl md:text-4xl text-[var(--color-cream)] tracking-wide">
              DC Bikes Cantabria · El Astillero
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-6">
            <div className="flex flex-col items-center text-center gap-2">
              <span className="w-11 h-11 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center">
                <MapPin size={20} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </span>
              <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide text-lg">Dónde estamos</p>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed">
                El Astillero, Cantabria<br />CP 39610
              </p>
            </div>

            <div className="flex flex-col items-center text-center gap-2">
              <span className="w-11 h-11 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center">
                <Phone size={20} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </span>
              <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide text-lg">Llámanos</p>
              <a
                href="tel:+34942054501"
                className="text-[var(--color-cream-dim)] hover:text-[var(--color-lavender)] transition-colors font-[var(--font-body)] text-sm"
              >
                +34 942 05 45 01
              </a>
            </div>

            <div className="flex flex-col items-center text-center gap-2">
              <span className="w-11 h-11 rounded-xl bg-[var(--color-lavender)]/15 flex items-center justify-center">
                <Clock size={20} className="text-[var(--color-lavender)]" aria-hidden="true" />
              </span>
              <p className="font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide text-lg">Horario</p>
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-sm leading-relaxed">
                Lunes a viernes<br />9:30–13:30 · 16:30–20:00
              </p>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              to="/contacto"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[var(--color-lavender)]/40 text-[var(--color-lavender)] font-[var(--font-cond)] tracking-wide hover:bg-[var(--color-lavender)]/10 transition-colors"
            >
              Ver contacto y cómo llegar
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
