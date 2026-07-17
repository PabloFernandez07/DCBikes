import { useNavigate } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FondoGradiente, HeroText, ScrubHero, type BloqueHero } from "@/components/public/ScrubHero";

interface ScrollVideoHeroProps {
  onQuoteOpen: () => void;
}

// v5 = 24 fps, 1080p all-intra. Se volvió a v5 desde v6 (2026-07-17): v6 metía
// 48 fps INTERPOLADOS (minterpolate) que solo servían para dar cadencia al motor
// de canvas (WebCodecs, ahora apagado). Reproduciendo el <video> de forma nativa
// esos fotogramas de más no aportan y se pagaban en NITIDEZ: v6 daba 269 kbit por
// fotograma contra los 461 de v5 (-42 % de bits por imagen). v5 se ve más nítido
// Y pesa menos (6,98 vs 8,03 MB). Sigue all-intra (121/121 keyframes) → el seek
// por currentTime cae en keyframe y es instantáneo. El póster ya es el fotograma
// 0 de v5, así que el relevo póster→vídeo es invisible.
export const HERO_VIDEO = "/hero/hero-scrub-v5.mp4";
// El póster es el fotograma 0 y ese no ha cambiado: sigue valiendo el de v5.
export const HERO_POSTER = "/hero/hero-poster-v5.jpg";

/**
 * El hero de la portada. Toda la maquinaria (WebCodecs, worker, canvas, plan B)
 * vive en ScrubHero: aquí solo está el contenido y cuándo aparece cada bloque.
 */
export function ScrollVideoHero({ onQuoteOpen }: ScrollVideoHeroProps) {
  const navigate = useNavigate();

  const bloques: BloqueHero[] = [
    {
      key: "badge",
      rango: { inStart: 0.00, inEnd: 0.08, outStart: 0.70, outEnd: 0.78 },
      // SIN backdrop-blur, y no es un descuido: el blur del badge costaba
      // ~5,7 ms/frame de composición SOFTWARE (2 render passes extra sobre un
      // fondo que cambia en cada frame de scroll) y era la causa nº 1 del
      // tirón del hero en máquinas sin aceleración gráfica. Quitarlo dejó la
      // portada sin GPU clavada al vsync (medido). El fondo lleva la mezcla
      // ink+lavanda ya "cocinada" con más alpha para dar el mismo contraste.
      nodo: (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(52,43,58,0.7)] border border-[rgba(196,162,207,0.3)] w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-[spulse_2s_ease-in-out_infinite]" />
          <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-lavender)]">
            El Astillero · Cantabria
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
            fontSize: "clamp(2.4rem, 9vw, 8rem)",
            textShadow: "0 4px 24px rgba(0,0,0,0.55)",
          }}
        >
          <span className="block">
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="MUÉVETE" baseDelay={200} />
            </span>
          </span>
          <span className="block text-[var(--color-lavender)]">
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="SIN" baseDelay={700} />
            </span>
            {" "}
            <span style={{ whiteSpace: "nowrap" }}>
              <HeroText text="LÍMITES" baseDelay={920} />
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
          Tu tienda de bicicletas de confianza. Venta, taller y asesoramiento
          profesional en el corazón de Cantabria.
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
            onClick={() => navigate("/catalogo")}
            className="font-[var(--font-display)] tracking-widest text-xl"
          >
            Ver catálogo
            <ArrowRight size={20} aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={onQuoteOpen}
            className="font-[var(--font-display)] tracking-widest text-xl"
          >
            Pedir presupuesto
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ScrubHero
      video={HERO_VIDEO}
      poster={HERO_POSTER}
      // DOS pantallas, no tres, y el motivo es la FLUIDEZ. El recorrido de scroll
      // se reparte entre los fotogramas del vídeo: px_por_fotograma =
      // (pantallas-1)*alto_ventana / (nº fotogramas - 1), y a velocidad de lectura
      // salen v_scroll/px_por_fotograma imágenes nuevas por segundo. v5 tiene 121
      // fotogramas; con 3 pantallas eso son 18 px/fotograma a 1080 -> solo ~8 img/s
      // leyendo (trabado, medido). Con 2 pantallas: 9 px/fotograma -> ~17 img/s, el
      // DOBLE, sin tocar el vídeo ni el peso. La portada está sobremuestreada 7x
      // (la cámara casi no se mueve: 0,87 px de contenido por fotograma), así que
      // no le hacen falta más fotogramas, solo menos recorrido. Es lo que hace GTA
      // VI: recorrido corto y denso (4-8 px/imagen) en vez de largo y ralo.
      // Los rangos de aparición del texto NO se recalibran: van en progreso 0..1,
      // se comprimen solos. Para fluidez de refresco total haría falta el canvas
      // con blending (ver la skill scroll-video-optimo); esto es el nivel gratis.
      pantallas={2}
      bloques={bloques}
      // En móvil la portada nunca ha enseñado el vídeo (son megas para nada en
      // datos): un degradado de marca y a correr.
      fondoMovil={<FondoGradiente />}
    />
  );
}
