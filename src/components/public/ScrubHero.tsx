import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useHeroFlags } from "@/hooks/useHeroFlags";
import { useScrollVideo } from "@/hooks/useScrollVideo";
import { soportaScrubWebCodecs, useScrubRenderer } from "@/hooks/useScrubRenderer";
import { lerpReveal } from "@/lib/reveal";

/** Cuándo entra y cuándo se va un bloque, en unidades de progreso del scroll (0..1). */
export interface RangoReveal {
  inStart: number;
  inEnd: number;
  outStart: number;
  outEnd: number;
}

/** Un trozo de contenido que aparece y desaparece con el scroll. */
export interface BloqueHero {
  key: string;
  rango: RangoReveal;
  nodo: ReactNode;
}

export interface ScrubHeroProps {
  /** MP4 ALL-INTRA (un keyframe por fotograma). Sin eso, el scrub va a tirones
   *  y no hay código que lo arregle: cada salto obligaría al navegador a
   *  descomprimir desde el keyframe anterior. */
  video: string;
  /** Se ve DEBAJO del canvas hasta que el worker pinta el primer fotograma, así
   *  que nunca hay un hero en negro mientras baja el vídeo. Debe ser el
   *  fotograma 0 del MP4: así el relevo es invisible. */
  poster: string;
  /** Tamaño nativo del MP4. Se le da al canvas antes de transferirlo para que el
   *  object-fit:cover recorte bien desde el primer momento. */
  ancho: number;
  alto: number;
  /** Cuántas pantallas de scroll dura el vídeo. La portada usa 5 (es el
   *  escaparate); una página de servicio debería usar menos, o metes cinco
   *  pantallas entre el visitante y lo que ha venido a buscar. */
  pantallas?: number;
  bloques: BloqueHero[];
  /** Qué se pinta de fondo en móvil y con reduced-motion, donde NO hay scrub y
   *  el MP4 ni se descarga. Por defecto, el póster. */
  fondoMovil?: ReactNode;
  /**
   * De dónde recorta el `object-fit: cover` cuando la pantalla es más
   * panorámica que el vídeo (16:9). Por defecto centra, y entonces se come lo
   * de arriba Y lo de abajo a partes iguales.
   *
   * En el taller eso decapitaba el sillín: en el vídeo tiene 85 px de aire por
   * encima, el recorte se comía la mitad y la barra de navegación tapaba el
   * resto. Con "center top" no se recorta nada por arriba; todo el recorte se va
   * al suelo, donde solo hay sombra.
   */
  encuadre?: string;
  /**
   * Baja el vídeo estos píxeles, para que el contenido no quede debajo de la
   * barra de navegación (que es fija y translúcida, y tapa la franja de arriba).
   *
   * Con `encuadre="center top"` no basta: alinea el vídeo con el borde superior,
   * y como el vídeo se escala POR ANCHO, en pantallas estrechas el escalado es
   * menor y el sillín cae MÁS ARRIBA, otra vez debajo de la barra. Medido:
   *   1366px de ancho -> sillín a 60px · barra 80px -> TAPADO
   *   1850px de ancho -> sillín a 82px · barra 80px -> se ve por los pelos
   * Bajando el vídeo la altura de la barra, el sillín se salva en TODAS.
   *
   * La franja que queda arriba no se ve: está justo debajo de la barra, que es
   * opaca al 92%.
   */
  margenSuperior?: number;
}

/**
 * Hero con el vídeo gobernado por el scroll ("scrubbing"), como la web de GTA VI.
 *
 * El motor de verdad está en useScrubRenderer: un Web Worker descarga el MP4, lo
 * demuxea, descodifica los fotogramas con WebCodecs y los pinta en un
 * OffscreenCanvas. El scroll NO toca `video.currentTime` en ningún momento:
 * calcula un ÍNDICE de fotograma. Cero seeks => cero viajes a la red => cero
 * congelaciones por falta de buffer, que era la causa real del tirón.
 *
 * Si el navegador no puede (Safari viejo, iOS), cae al <video> + currentTime de
 * toda la vida, que es literalmente el plan B que Rockstar sirve a iOS.
 *
 * Este componente es solo la carcasa: el vídeo, el póster, los velos, la barra
 * de progreso y el indicador. El CONTENIDO lo pone quien lo usa, en `bloques`.
 */
export function ScrubHero({
  video,
  poster,
  ancho,
  alto,
  pantallas = 5,
  bloques,
  fondoMovil,
  encuadre = "center",
  margenSuperior = 0,
}: ScrubHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  // Si el renderer de WebCodecs falla (MP4 raro, sin descodificador, worker
  // caído...) se cae al <video>, que sigue funcionando.
  const [scrubFallido, setScrubFallido] = useState(false);
  const onScrubFail = useCallback(() => setScrubFallido(true), []);
  // Un vídeo nuevo merece otra oportunidad: si falló con el anterior, no tiene
  // por qué fallar con este.
  useEffect(() => setScrubFallido(false), [video]);

  // Los bloques, la barra y el indicador se animan escribiendo sus estilos A
  // MANO. Si esto pasara por estado de React, cada frame de scroll
  // re-renderizaría el hero entero —letras animadas del título incluidas— y ahí
  // es donde se iba la fluidez.
  const revealRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const { isMobile, isReducedMotion } = useHeroFlags();
  const lock = !isMobile && !isReducedMotion;

  // applyProgress es estable (deps vacías) para no re-montar el worker en cada
  // render, así que `lock` y `bloques` le llegan por ref.
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const bloquesRef = useRef(bloques);
  bloquesRef.current = bloques;

  const applyProgress = useCallback((p: number) => {
    // Cinturón y tirantes. Sin scrub los bloques NO llevan estilo en línea y el
    // CSS los pinta visibles; si alguien llamara aquí con p=0 escribiríamos
    // `opacity: 0` sobre el titular y los botones, y como sin scrub nadie vuelve
    // a llamar jamás, el hero se quedaría mudo PARA SIEMPRE con
    // prefers-reduced-motion — justo para quien peor sienta. Que no se pueda.
    if (!lockRef.current) return;

    for (const b of bloquesRef.current) {
      const el = revealRefs.current[b.key];
      if (!el) continue;
      const { opacity, translateY } = lerpReveal(
        p, b.rango.inStart, b.rango.inEnd, b.rango.outStart, b.rango.outEnd,
      );
      el.style.opacity = String(opacity);
      // translate3d fuerza la capa en GPU; translateY a secas puede quedarse en CPU.
      el.style.transform = `translate3d(0, ${translateY}px, 0)`;
    }

    // scaleX en vez de width: animar width recalcula el layout en cada frame; un
    // transform no toca el layout y lo resuelve la GPU.
    if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;

    if (indicatorRef.current) {
      indicatorRef.current.style.opacity = String(
        p < 0.04 ? 1 : Math.max(0, 1 - (p - 0.04) / 0.04),
      );
    }
  }, []);

  // El canvas solo cuando hay scrub que hacer y el navegador puede. En móvil NI
  // SE DESCARGA el MP4 — y "móvil" incluye el teléfono apaisado y la tablet, no
  // solo el ancho de pantalla (ver useHeroFlags).
  const usaCanvas = lock && soportaScrubWebCodecs && !scrubFallido;

  useScrubRenderer(sectionRef, canvasHostRef, applyProgress, {
    enabled: usaCanvas,
    onFail: onScrubFail,
    video,
    ancho,
    alto,
    encuadre,
  });

  // El <video> solo lo gobierna useScrollVideo cuando NO manda el canvas.
  useScrollVideo(sectionRef, videoRef, applyProgress, !usaCanvas);

  const revealStyle = lock
    ? { opacity: 0, willChange: "opacity, transform" as const }
    : undefined;

  // Props del contenedor de cada bloque. Deliberadamente NO es un componente
  // declarado aquí dentro: eso crearía un tipo nuevo en cada render y React
  // remontaría el subárbol, relanzando la animación letra a letra del título.
  const reveal = (key: string) => ({
    ref: (el: HTMLDivElement | null) => { revealRefs.current[key] = el; },
    style: revealStyle,
  });

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: lock ? `${pantallas * 100}vh` : "100dvh" }}
    >
      <div
        className={
          lock
            ? "sticky top-0 h-[100dvh] w-full overflow-hidden"
            : "relative h-[100dvh] w-full overflow-hidden"
        }
      >
        {/* Capa del fondo. Va en su propio contenedor para poder BAJARLA sin
            mover ni los velos ni el texto. Lleva el color de fondo para que la
            franja de arriba (la que tapa la barra) no sea un agujero. */}
        <div
          className="absolute inset-0 overflow-hidden bg-[var(--color-ink)]"
          style={{ top: margenSuperior }}
          aria-hidden="true"
        >
        {!isMobile ? (
          <>
            {/* El póster va DEBAJO y siempre. El canvas nace con opacity:0 y solo
                se destapa cuando el worker pinta su primer fotograma, así que
                nunca hay hero en negro mientras baja el vídeo.
                Si manda el canvas, el <video> ni se monta: no se descarga dos veces. */}
            <img
              src={poster}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: encuadre }}
            />
            {usaCanvas ? (
              <div ref={canvasHostRef} className="absolute inset-0" aria-hidden="true" />
            ) : (
              <video
                ref={videoRef}
                src={video}
                poster={poster}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: encuadre }}
              />
            )}
          </>
        ) : (
          fondoMovil ?? (
            <img
              src={poster}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: encuadre }}
            />
          )
        )}
        </div>

        {/* Velo lateral: contraste para que el texto se lea sobre el vídeo. */}
        {!isMobile && (
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(90deg, var(--color-ink) 0%, rgba(26,22,32,0.65) 35%, rgba(26,22,32,0.25) 60%, transparent 80%)",
            }}
          />
        )}
        {/* Velo inferior: cose el hero con la sección de abajo. */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(16,13,20,0.92) 100%)",
          }}
        />

        {/* El contenido */}
        <div className="absolute inset-0 z-10 flex items-center px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-7 max-w-xl lg:max-w-2xl">
            {bloques.map(b => (
              <div key={b.key} {...reveal(b.key)}>{b.nodo}</div>
            ))}
          </div>
        </div>

        {lock && (
          <div
            ref={indicatorRef}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-[var(--color-cream-dim)] pointer-events-none"
            aria-hidden="true"
          >
            <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase">
              Scroll
            </span>
            <div className="w-px h-8 bg-gradient-to-b from-[var(--color-cream-dim)] to-transparent" />
          </div>
        )}

        {lock && (
          <div
            className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10 z-20 pointer-events-none"
            aria-hidden="true"
          >
            <div
              ref={barRef}
              className="h-full w-full origin-left"
              style={{
                transform: "scaleX(0)",
                background: "var(--color-brand-red)",
                willChange: "transform",
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** Una letra que entra sola. Se usa para los titulares del hero. */
function AnimatedChar({ char, delay }: { char: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <span
      style={{
        display: "inline-block",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(0.35em)",
        transition: "opacity 0.45s ease, transform 0.45s ease",
      }}
    >
      {char === " " ? " " : char}
    </span>
  );
}

/** Titular que aparece letra a letra. */
export function HeroText({ text, baseDelay }: { text: string; baseDelay: number }) {
  return (
    <span>
      {text.split("").map((char, i) => (
        <AnimatedChar key={i} char={char} delay={baseDelay + i * 55} />
      ))}
    </span>
  );
}
