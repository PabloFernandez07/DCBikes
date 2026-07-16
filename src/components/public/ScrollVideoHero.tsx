import { useNavigate } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FondoGradiente, HeroText, ScrubHero, type BloqueHero } from "@/components/public/ScrubHero";

interface ScrollVideoHeroProps {
  onQuoteOpen: () => void;
}

// v6 = 48 fps (antes 24). Lo que se compra aquí es CADENCIA, no nitidez: el
// recorrido de scroll se reparte entre los fotogramas que haya, y con 121 salían
// 36 px de scroll por fotograma — el hero se veía a ~20 img/s con el navegador
// yendo a 60 fps y cero frames perdidos. Con 239 fotogramas y 3 pantallas salen
// 9 px por fotograma: imagen nueva en casi cada refresco.
// Los fotogramas de en medio están INTERPOLADOS (minterpolate, compensación de
// movimiento): el vídeo se generó con IA a 24 fps y no hay fuente que
// re-renderizar. Ver la nota de memoria del hero para la receta exacta.
// Cuesta 1 MB (6,7 -> 7,7): el doble de fotogramas sale casi gratis porque van a
// CRF 30 en vez de 28 y cada interpolado se parece mucho a sus vecinos.
// Sigue siendo all-intra (239 fotogramas / 239 keyframes), que es innegociable.
// Nombre nuevo = caché de Vercel rota sin tener que purgarla a mano.
export const HERO_VIDEO = "/hero/hero-scrub-v6.mp4";
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
      // Tres pantallas, no cinco, y el motivo es la FLUIDEZ, no el diseño.
      // El recorrido de scroll se reparte entre los fotogramas que tenga el
      // vídeo: con 5 pantallas salían 4320 px / 120 saltos = 36 px de scroll por
      // fotograma, y a velocidad de lectura (600 px/s) eso son ~17 imágenes
      // nuevas por segundo. El hero se veía a saltos con el navegador yendo a
      // 60 fps clavados y cero frames perdidos: no era jank, era que no había
      // imágenes que enseñar. Medido: 5 pantallas -> 20 fps efectivos;
      // 3 -> 30; 2 -> 60. Con el vídeo ya a 48 fps, 3 pantallas dan 9 px por
      // fotograma, que es cadencia de sobra.
      // Si subes este número, baja la fluidez en proporción directa. La regla:
      // px_por_fotograma = (pantallas-1)*alto_ventana / (nº fotogramas - 1),
      // y tiene que quedar por debajo de ~10.
      pantallas={3}
      bloques={bloques}
      // En móvil la portada nunca ha enseñado el vídeo (son megas para nada en
      // datos): un degradado de marca y a correr.
      fondoMovil={<FondoGradiente />}
    />
  );
}
