import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'

export default function NotFound() {
  return (
    <>
      <SEO
        title="Página no encontrada"
        description="La página que buscas no existe en DC Bikes Cantabria."
        noIndex={true}
      />

      <section className="bg-[var(--color-ink)] min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="relative flex flex-col items-center justify-center text-center">
          {/* Número decorativo gigante de fondo */}
          <span
            aria-hidden="true"
            className="font-[var(--font-display)] leading-none select-none absolute pointer-events-none text-[rgba(196,162,207,0.06)]"
            style={{ fontSize: 'clamp(10rem,30vw,20rem)' }}
          >
            404
          </span>

          {/* Contenido sobre el número */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            {/* Etiqueta pequeña */}
            <span className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)]">
              Error 404
            </span>

            {/* Título principal */}
            <h1 className="font-[var(--font-display)] text-6xl md:text-8xl text-[var(--color-cream)] tracking-wide leading-none mt-1">
              PÁGINA NO ENCONTRADA
            </h1>

            {/* Subtexto */}
            <p className="font-[var(--font-body)] text-[var(--color-mid)] text-lg mt-4 max-w-md text-center">
              Parece que esta ruta no existe. Puede que la página haya cambiado de dirección.
            </p>

            {/* Botones */}
            <div className="flex gap-3 mt-8 flex-wrap justify-center">
              <Link to="/">
                <Button variant="primary" size="lg">Volver al inicio</Button>
              </Link>
              <Link to="/catalogo">
                <Button variant="ghost" size="lg">Ver catálogo</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
