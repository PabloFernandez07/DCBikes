import { useEffect, useState } from "react";

export interface ScrollVideoFlags {
  isMobile: boolean;
  isReducedMotion: boolean;
}

/**
 * "Móvil" NO es solo un ancho.
 *
 * Con `max-width: 768px` a secas, girar el teléfono (812x375) o abrir un iPad
 * apaisado (1024x768) entraba por la ruta de ESCRITORIO: se bajaban los 7,5 MB
 * del MP4 y se arrancaba el worker de WebCodecs con datos móviles y GPU de
 * teléfono. El requisito "en móvil ni se descarga el vídeo" solo se cumplía en
 * RETRATO, y se rompía en cuanto el usuario giraba el aparato.
 *
 * Se mira también el tipo de puntero. `pointer: coarse` es el puntero PRIMARIO,
 * así que un portátil con pantalla táctil y ratón sigue siendo `fine` y no se
 * lleva por delante al escritorio; y el tope de 1024 px deja fuera a los
 * monitores táctiles grandes, donde el scrub sí tiene sentido.
 */
const MQ_MOVIL = "(max-width: 768px), (pointer: coarse) and (max-width: 1024px)";
const MQ_REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Las dos condiciones que deciden si el hero hace scrub o no.
 *
 * Vive en su propio hook porque hace falta saberlas ANTES de elegir quién pinta
 * el hero (el canvas de WebCodecs o el <video>), y esa decisión es justamente lo
 * que se le pasa a useScrollVideo. Si las flags salieran de useScrollVideo,
 * habría una dependencia circular.
 */
export function useHeroFlags(): ScrollVideoFlags {
  const [flags, setFlags] = useState<ScrollVideoFlags>(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isReducedMotion: false };
    }
    return {
      isMobile: window.matchMedia(MQ_MOVIL).matches,
      isReducedMotion: window.matchMedia(MQ_REDUCED).matches,
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqMobile = window.matchMedia(MQ_MOVIL);
    const mqReduced = window.matchMedia(MQ_REDUCED);
    const sync = () =>
      setFlags({ isMobile: mqMobile.matches, isReducedMotion: mqReduced.matches });
    sync();
    mqMobile.addEventListener("change", sync);
    mqReduced.addEventListener("change", sync);
    return () => {
      mqMobile.removeEventListener("change", sync);
      mqReduced.removeEventListener("change", sync);
    };
  }, []);

  return flags;
}
