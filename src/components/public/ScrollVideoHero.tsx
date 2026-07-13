import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useScrollVideo } from "@/hooks/useScrollVideo";
import { lerpReveal } from "@/lib/reveal";

interface ScrollVideoHeroProps {
  onQuoteOpen: () => void;
}

// Rangos de reveal por bloque (afinables tras pruebas visuales)
const RANGES = {
  badge:     { inStart: 0.00, inEnd: 0.08, outStart: 0.70, outEnd: 0.78 },
  title:     { inStart: 0.05, inEnd: 0.18, outStart: 0.70, outEnd: 0.82 },
  divider:   { inStart: 0.15, inEnd: 0.25, outStart: 0.70, outEnd: 0.82 },
  paragraph: { inStart: 0.22, inEnd: 0.34, outStart: 0.72, outEnd: 0.85 },
  ctas:      { inStart: 0.30, inEnd: 0.44, outStart: 0.78, outEnd: 0.90 },
} as const;

type RevealKey = keyof typeof RANGES;
const REVEAL_KEYS = Object.keys(RANGES) as RevealKey[];

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

function HeroText({ text, baseDelay }: { text: string; baseDelay: number }) {
  return (
    <span>
      {text.split("").map((char, i) => (
        <AnimatedChar key={i} char={char} delay={baseDelay + i * 55} />
      ))}
    </span>
  );
}

export function ScrollVideoHero({ onQuoteOpen }: ScrollVideoHeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();

  // Los bloques que se revelan, la barra y el indicador se animan escribiendo
  // sus estilos a mano. Si esto pasara por estado de React, cada frame de
  // scroll re-renderizaría el hero entero —incluidas las 18 letras animadas del
  // título— y ahí es donde se iba la fluidez.
  const revealRefs = useRef<Partial<Record<RevealKey, HTMLDivElement | null>>>({});
  const barRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const applyProgress = useCallback((p: number) => {
    for (const key of REVEAL_KEYS) {
      const el = revealRefs.current[key];
      if (!el) continue;
      const r = RANGES[key];
      const { opacity, translateY } = lerpReveal(p, r.inStart, r.inEnd, r.outStart, r.outEnd);
      el.style.opacity = String(opacity);
      // translate3d fuerza la capa en GPU; translateY a secas puede quedarse en CPU.
      el.style.transform = `translate3d(0, ${translateY}px, 0)`;
    }

    // scaleX en vez de width: width recalcula el layout en cada frame, un
    // transform no toca el layout y lo resuelve la GPU.
    if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;

    if (indicatorRef.current) {
      indicatorRef.current.style.opacity = String(
        p < 0.04 ? 1 : Math.max(0, 1 - (p - 0.04) / 0.04),
      );
    }
  }, []);

  const { isMobile, isReducedMotion } = useScrollVideo(sectionRef, videoRef, applyProgress);

  // En móvil o reduced-motion: vídeo en autoplay-loop, sección 100dvh, texto
  // estático y visible desde el principio (nadie le escribe estilos).
  const lock = !isMobile && !isReducedMotion;

  // Con scrub, los bloques arrancan invisibles y los va sacando el scroll. Sin
  // scrub no se tocan nunca, así que se quedan tal cual los pinta el CSS.
  const revealStyle = lock
    ? { opacity: 0, willChange: "opacity, transform" as const }
    : undefined;

  // Props del contenedor de cada bloque. Deliberadamente NO es un componente
  // declarado aquí dentro: eso crearía un tipo nuevo en cada render y React
  // remontaría el subárbol, relanzando la animación letra a letra del título.
  const reveal = (name: RevealKey) => ({
    ref: (el: HTMLDivElement | null) => { revealRefs.current[name] = el; },
    style: revealStyle,
  });

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: lock ? "500vh" : "100dvh" }}
    >
      <div
        className={
          lock
            ? "sticky top-0 h-[100dvh] w-full overflow-hidden"
            : "relative h-[100dvh] w-full overflow-hidden"
        }
      >
        {/* Fondo: vídeo en desktop, gradiente estático en móvil */}
        {!isMobile ? (
          <video
            ref={videoRef}
            src="/hero/hero-scrub-v2.mp4"
            poster="/hero/hero-poster-v2.jpg"
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
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
        )}

        {/* Velo lateral izquierdo: contraste para el texto (solo desktop) */}
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
        {/* Velo inferior */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(16,13,20,0.92) 100%)",
          }}
        />

        {/* Overlay tipográfico */}
        <div className="absolute inset-0 z-10 flex items-center px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-7 max-w-xl lg:max-w-2xl">
            <div {...reveal("badge")}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(196,162,207,0.15)] border border-[rgba(196,162,207,0.3)] w-fit backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-[spulse_2s_ease-in-out_infinite]" />
                <span className="font-[var(--font-cond)] text-xs tracking-widest uppercase text-[var(--color-lavender)]">
                  El Astillero · Cantabria
                </span>
              </div>
            </div>

            <div {...reveal("title")}>
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
            </div>

            <div {...reveal("divider")}>
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-brand-red)] via-[var(--color-lavender)] to-transparent" />
                <Star
                  size={12}
                  className="text-[var(--color-lavender)]"
                  fill="currentColor"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div {...reveal("paragraph")}>
              <p
                className="text-[var(--color-cream-dim)] font-[var(--font-body)] text-lg max-w-md leading-relaxed"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.55)" }}
              >
                Tu tienda de bicicletas de confianza. Venta, taller y
                asesoramiento profesional en el corazón de Cantabria.
              </p>
            </div>

            <div {...reveal("ctas")}>
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
            </div>
          </div>
        </div>

        {/* Indicador "Scroll" — visible al inicio del lock */}
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

        {/* Barra de progreso del scroll-video */}
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
