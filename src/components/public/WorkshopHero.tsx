import { Link } from "react-router-dom";
import { ArrowRight, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FondoGradiente, HeroText, ScrubHero, type BloqueHero } from "@/components/public/ScrubHero";

export const TALLER_VIDEO = "/taller/despiece-scrub-v1.mp4";
export const TALLER_POSTER = "/taller/despiece-poster-v1.jpg";

interface WorkshopHeroProps {
  onQuoteOpen: () => void;
}

/**
 * El hero del taller: una Giant que se va despiezando conforme bajas.
 *
 * El texto se apoya en lo que el vídeo está demostrando. «Taller experto» y
 * «en las mejores manos» lo dice todo el mundo y no prueban nada; «conocemos
 * cada pieza» es una afirmación que el despiece está demostrando mientras el
 * cliente la lee.
 */
export function WorkshopHero({ onQuoteOpen }: WorkshopHeroProps) {
  const bloques: BloqueHero[] = [
    {
      key: "eyebrow",
      rango: { inStart: 0.00, inEnd: 0.08, outStart: 0.70, outEnd: 0.78 },
      nodo: (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(196,162,207,0.15)] border border-[rgba(196,162,207,0.3)] w-fit backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-[spulse_2s_ease-in-out_infinite]" />
          <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-lavender)]">
            Nuestro taller · El Astillero
          </span>
        </div>
      ),
    },
    {
      key: "title",
      rango: { inStart: 0.05, inEnd: 0.18, outStart: 0.70, outEnd: 0.82 },
      nodo: (
        <h1
          className="font-[var(--font-display)] leading-none tracking-wide text-[var(--color-cream)]"
          style={{
            fontSize: "clamp(2.2rem, 7.5vw, 6.5rem)",
            textShadow: "0 4px 24px rgba(0,0,0,0.55)",
          }}
        >
          <span className="block">
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="CONOCEMOS" baseDelay={200} />
            </span>
          </span>
          <span className="block text-[var(--color-lavender)]">
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="CADA" baseDelay={780} />
            </span>
            {" "}
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="PIEZA" baseDelay={1030} />
            </span>
          </span>
        </h1>
      ),
    },
    {
      key: "divider",
      rango: { inStart: 0.15, inEnd: 0.25, outStart: 0.70, outEnd: 0.82 },
      nodo: (
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-brand-red)] via-[var(--color-lavender)] to-transparent" />
          <Star size={12} className="text-[var(--color-lavender)]" fill="currentColor" aria-hidden="true" />
        </div>
      ),
    },
    {
      key: "paragraph",
      rango: { inStart: 0.22, inEnd: 0.34, outStart: 0.72, outEnd: 0.85 },
      nodo: (
        <p
          className="text-[var(--color-cream-dim)] font-[var(--font-body)] text-lg max-w-md leading-relaxed"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
        >
          Porque la hemos desmontado mil veces. Mecánicos especializados en todas
          las marcas y disciplinas, en El Astillero.
        </p>
      ),
    },
    {
      key: "ctas",
      rango: { inStart: 0.30, inEnd: 0.44, outStart: 0.78, outEnd: 0.90 },
      nodo: (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={onQuoteOpen}
            className="font-[var(--font-display)] tracking-widest text-xl"
          >
            Pedir presupuesto
            <ArrowRight size={20} aria-hidden="true" />
          </Button>
          <Link to="/contacto">
            <Button
              variant="secondary"
              size="lg"
              className="font-[var(--font-display)] tracking-widest text-xl"
            >
              <Phone size={18} aria-hidden="true" />
              Cómo llegar
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <ScrubHero
      video={TALLER_VIDEO}
      poster={TALLER_POSTER}
      ancho={1920}
      alto={1080}
      // Tres pantallas, no cinco: en la portada el hero ES el escaparate, pero
      // aquí el visitante viene a ver servicios y precios. Cinco pantallas de
      // vídeo por delante serían cine caro.
      pantallas={3}
      // La pantalla es más panorámica que el vídeo (16:9), así que cover recorta
      // arriba y abajo. Centrado, se comía el sillín. Todo el recorte al suelo.
      encuadre="center top"
      // El hero es sticky top-0 igual que la barra: al hacer scroll se metía
      // DEBAJO de ella y le cortaba el sillín. Que se pegue por debajo.
      alturaBarra={80}
      bloques={bloques}
      // En móvil, como la portada: sin bici, solo el mensaje sobre el degradado
      // de marca. El despiece a lo ancho de un móvil se ve pequeño y apretado.
      fondoMovil={<FondoGradiente />}
    />
  );
}
