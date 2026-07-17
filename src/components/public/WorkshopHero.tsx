import { Link } from "react-router-dom";
import { ArrowRight, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FondoGradiente, HeroText, ScrubHero, type BloqueHero } from "@/components/public/ScrubHero";

// v3 = el render "bici desmontada" de public/webScroll/Bici_Despiece_1080,
// re-encodado a 1080p ALL-INTRA (145/145 keyframes). CRF 25 → 4,6 MB. El taller usa
// el MISMO motor que la portada —canvas WebCodecs + decode-ahead: descodifica el
// clip entero por adelantado y en el scroll solo pinta, para ir fluido en Opera GX—
// pero SIN blending: las piezas del despiece se mueven y el cross-fade las
// duplicaría, así que se pinta el índice tal cual. El póster es el fotograma 0 de v3.
export const TALLER_VIDEO = "/taller/despiece-scrub-v3.mp4";
export const TALLER_POSTER = "/taller/despiece-poster-v3.jpg";

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
      // SIN backdrop-blur, igual que el badge de la portada: costaba ~5,7
      // ms/frame de composición software (el taller pasó de 18-23 frames >25 ms
      // por pasada a 1-2 solo con esto, medido sin GPU). Fondo pre-mezclado con
      // más alpha en su lugar.
      nodo: (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(52,43,58,0.7)] border border-[rgba(196,162,207,0.3)] w-fit">
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
      // DOS pantallas, por fluidez (igual que la portada): v1 tiene 145 fotogramas
      // y con 3 pantallas salían 15 px/fotograma -> ~10 img/s leyendo (trabado);
      // con 2 pantallas, 7,5 px -> ~20 img/s, el doble, sin tocar el vídeo ni el
      // peso. Aviso honesto: el taller tiene un límite que la geometría NO cura —
      // las piezas del despiece se mueven hasta 21 px por fotograma (la cámara de
      // la portada está quieta, esto no), y ese salto de CONTENIDO por imagen es
      // intrínseco a la fuente (render de Giant, sin proyecto 3D ni fuente a más
      // fps). Bajar pantallas sube la cadencia; el salto de las piezas se queda.
      pantallas={2}
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
