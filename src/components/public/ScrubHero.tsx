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
   * Altura de la barra de navegación, en píxeles. Si se pasa, el hero se pega
   * DEBAJO de ella en vez de detrás.
   *
   * Por qué hace falta: la barra es `sticky top-0` y ocupa sitio en el flujo, así
   * que al principio de la página el hero ya empieza a 80px y no hay solape.
   * Pero el hero también es `sticky top-0`: en cuanto haces scroll se PEGA ARRIBA
   * DEL TODO y se mete DEBAJO de la barra. En el taller eso decapitaba el sillín
   * justo al final del scroll, que es cuando está más alto (medido, a 1366px de
   * ancho: sillín a 60px, barra hasta 80px).
   *
   * Con esto el hero se pega a 80px y su altura se recorta otro tanto: el vídeo
   * nunca pasa por debajo de la barra, y al principio de la página tampoco queda
   * ninguna franja, porque es justo donde ya estaba.
   *
   * La portada no lo usa: ahí el vídeo por debajo de la barra translúcida queda
   * bien y no hay nada que decapitar.
   */
  alturaBarra?: number;
  /**
   * Enciende el motor de canvas (WebCodecs) CON cross-fade entre fotogramas
   * vecinos: la cadencia pasa a ser la del refresco en vez de la de nFrames, o
   * sea fluidez de "GTA VI" sin subir el número de fotogramas ni el peso.
   *
   * Solo para planos de POCO movimiento. La portada lo activa (su cámara está
   * casi quieta: el cross-fade es imperceptible). El taller NO: sus piezas se
   * mueven y el cross-fade las duplicaría (doble exposición), así que se queda
   * con el <video>. Sin WebCodecs (Safari viejo) cae también al <video>.
   */
  blending?: boolean;
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
  pantallas = 5,
  bloques,
  fondoMovil,
  encuadre = "center",
  alturaBarra = 0,
  blending = false,
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

  // Panel de diagnóstico en pantalla (?herodiag=1): para ver en un navegador ajeno
  // (Opera GX...) qué motor se usa y dónde se cuelga, sin abrir DevTools. Inerte
  // sin el parámetro. El renderer le añade los eventos del worker (ver useScrubRenderer).
  const herodiag =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("herodiag");

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
      // opacity:0 NO saca del orden de tabulación ni del hit-testing: sin esto,
      // un bloque invisible deja sus botones tabulables y clicables (WCAG 2.4.7).
      // inert lo saca de foco, tab y puntero mientras está oculto.
      el.toggleAttribute("inert", opacity < 0.05);
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

  // El canvas (WebCodecs) se enciende SOLO si esta página pide `blending` y el
  // navegador puede. La portada lo pide: el cross-fade entre fotogramas vecinos le
  // da cadencia de refresco (fluido de verdad) sin subir peso, y su cámara casi
  // quieta hace el fantasma imperceptible. El taller NO lo pide —sus piezas se
  // moverían y el cross-fade las duplicaría—, así que se queda con el <video> +
  // currentTime (all-intra: los seeks caen en keyframe y son instantáneos). Sin
  // WebCodecs (Safari viejo) o si el worker falla, la portada también cae al
  // <video>. En móvil NI se descarga el MP4 (lock ya es false ahí).
  const usaCanvas = blending && lock && soportaScrubWebCodecs && !scrubFallido;

  useScrubRenderer(sectionRef, canvasHostRef, applyProgress, {
    enabled: usaCanvas,
    onFail: onScrubFail,
    video,
    encuadre,
    blending,
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
    ref: (el: HTMLDivElement | null) => {
      revealRefs.current[key] = el;
      // Con scrub, revealStyle pinta el bloque a opacity:0 hasta que applyProgress
      // lo revele. Nace inerte para que no haya botones invisibles pero tabulables
      // antes del primer frame de scroll (WCAG 2.4.7); applyProgress lo abre.
      if (el && lockRef.current) el.toggleAttribute("inert", true);
    },
    style: revealStyle,
  });

  return (
    <>
      {herodiag && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.92)", color: "#33ff66",
            font: "12px/1.5 monospace", padding: "10px 12px",
            whiteSpace: "pre-wrap",
            // pointer-events:none para que el panel NO se coma el scroll de la
            // rueda: así la página baja y el medidor cuenta de verdad.
            pointerEvents: "none",
          }}
        >
          {`DIAGNÓSTICO DEL HERO  —  HAZ SCROLL arriba y abajo y mira el número de abajo
soporta WebCodecs: ${soportaScrubWebCodecs}
isMobile: ${isMobile}  ·  reducedMotion: ${isReducedMotion}  ·  lock: ${lock}
blending pedido: ${blending}  ·  usaCanvas: ${usaCanvas}  ·  scrubFallido: ${scrubFallido}
MOTOR ACTIVO: ${usaCanvas ? "CANVAS (WebCodecs)" : "VIDEO (fallback)"}`}
          <div
            id="hero-diag-live"
            style={{ fontSize: "20px", fontWeight: 700, margin: "10px 0", color: "#33ff66" }}
          >
            ▶ haz scroll para medir…
          </div>
          {`(45+ verde = fluido · 20-45 amarillo · menos de 20 rojo = trabado. Mándame una captura mientras haces scroll.)
──────── eventos del worker ────────`}
          <pre id="hero-diag-log" style={{ margin: 0, color: "#9ff" }} />
        </div>
      )}
    <section
      ref={sectionRef}
      className="relative"
      // Con scrub, alto fijo de N pantallas (el recorrido del scrub). Sin scrub,
      // MIN-alto de una pantalla: si el contenido no cabe (zoom al 400 %, que
      // reduce el viewport a 320 CSS px), la sección CRECE en vez de recortar los
      // CTA con overflow:hidden (era WCAG 1.4.10).
      style={lock ? { height: `${pantallas * 100}vh` } : { minHeight: "100dvh" }}
    >
      <div
        className={
          lock
            ? "sticky w-full overflow-hidden"
            : "relative min-h-[100dvh] w-full overflow-hidden"
        }
        style={
          lock
            ? { top: alturaBarra, height: `calc(100dvh - ${alturaBarra}px)` }
            : undefined
        }
      >
        {lock ? (
          <>
            {/* El póster va DEBAJO y siempre. El canvas nace con opacity:0 y solo
                se destapa cuando el worker pinta su primer fotograma, así que
                nunca hay hero en negro mientras baja el vídeo.
                Si manda el canvas, el <video> ni se monta: no se descarga dos veces.
                El <video> es el plan B (sin WebCodecs): scrub por currentTime,
                gobernado por el scroll, NUNCA en bucle automático. */}
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
        ) : !isMobile ? (
          // Escritorio con prefers-reduced-motion: el póster (el fotograma 0, el
          // escaparate REAL) congelado. Ni scrub, ni <video>, ni descarga del MP4:
          // quien pide menos movimiento ve el contenido quieto, no un vídeo en
          // bucle (era WCAG 2.2.2, nivel A). Se prefiere el póster al degradado de
          // móvil porque en escritorio no hay que ahorrar datos y el plano real
          // comunica más.
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: encuadre }}
          />
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

        {/* Velo lateral: contraste para que el texto se lea sobre el vídeo.
            Medido sin GPU: los dos velos cuestan ~3-4 ms/frame de composición
            software (translúcidos a pantalla completa sobre un canvas que
            cambia). CABEN en presupuesto una vez quitado el backdrop-blur del
            badge, por eso se quedan. Si algún día hay que arañar más, la
            palanca es hornearlos en el canvas del worker (y quitarlos del DOM
            solo cuando el canvas está destapado), NO añadir blur ni más capas
            translúcidas encima del vídeo. */}
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

        {/* El contenido. Con scrub va absolute (clavado sobre el vídeo). Sin scrub
            va en flujo con min-alto de pantalla y aire vertical: así, a zoom alto
            el bloque empuja y la sección crece, en vez de recortarse (WCAG 1.4.10). */}
        <div
          className={
            lock
              ? "absolute inset-0 z-10 flex items-center px-4 sm:px-6 lg:px-8"
              : "relative z-10 flex min-h-[100dvh] items-center px-4 sm:px-6 lg:px-8 py-20"
          }
        >
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
    </>
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

/**
 * El fondo de marca para móvil: degradado oscuro con un halo lavanda. En móvil
 * no hay scrub y el MP4 ni se descarga (son megas para nada en datos), así que
 * el hero enseña esto y solo el mensaje encima, igual en la portada y el taller.
 */
export function FondoGradiente() {
  return (
    <>
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(155deg, var(--color-ink-deep) 0%, var(--color-ink) 55%, rgba(196,162,207,0.04) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 80% 40%, rgba(196,162,207,0.07), transparent 65%)",
        }}
      />
    </>
  );
}

/** Titular que aparece letra a letra. */
export function HeroText({ text, baseDelay }: { text: string; baseDelay: number }) {
  return (
    <span>
      {/* Cada letra va en un <span display:inline-block> (AnimatedChar), y eso hace
          que el lector de pantalla DELETREE el titular ("M U É V E T E"). El
          sr-only da la palabra entera a la tecnología asistiva y los caracteres
          animados van aria-hidden: se ven, pero no se leen letra a letra. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split("").map((char, i) => (
          <AnimatedChar key={i} char={char} delay={baseDelay + i * 55} />
        ))}
      </span>
    </span>
  );
}
