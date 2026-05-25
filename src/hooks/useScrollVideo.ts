import { useEffect, useRef, useState } from "react";

export interface ScrollVideoState {
  progress: number;
  isMobile: boolean;
  isReducedMotion: boolean;
}

export function useScrollVideo(
  sectionRef: React.RefObject<HTMLElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): ScrollVideoState {
  const [progress, setProgress] = useState(0);
  const [flags, setFlags] = useState<{ isMobile: boolean; isReducedMotion: boolean }>(
    () => {
      if (typeof window === "undefined") {
        return { isMobile: false, isReducedMotion: false };
      }
      return {
        isMobile: window.matchMedia("(max-width: 768px)").matches,
        isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    },
  );

  const ticking = useRef(false);
  const rafId = useRef<number | null>(null);
  const lastTarget = useRef(-1);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqMobile = window.matchMedia("(max-width: 768px)");
    const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncFlags = () => {
      setFlags({
        isMobile: mqMobile.matches,
        isReducedMotion: mqReduced.matches,
      });
    };
    syncFlags();
    mqMobile.addEventListener("change", syncFlags);
    mqReduced.addEventListener("change", syncFlags);

    return () => {
      mqMobile.removeEventListener("change", syncFlags);
      mqReduced.removeEventListener("change", syncFlags);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    const lock = !flags.isMobile && !flags.isReducedMotion;

    if (!lock) {
      // Móvil o reduced motion: autoplay loop, sin scroll-lock.
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Algunos navegadores bloquean autoplay; el primer frame ya basta.
        });
      }
      setProgress(0);
      return;
    }

    // Desktop con motion: pausar y controlar por scroll.
    video.loop = false;
    video.autoplay = false;
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Algunos navegadores no aceptan currentTime antes de loadedmetadata.
    }

    let isReady = video.readyState >= 1 && Number.isFinite(video.duration);

    const onMeta = () => {
      isReady = true;
      update();
    };

    const update = () => {
      if (!isReady || !video.duration || !Number.isFinite(video.duration)) return;
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const scrolled = -rect.top;
      const p = Math.max(0, Math.min(1, scrolled / scrollable));
      setProgress(p);
      const target = p * video.duration;
      // Umbral de ~1 frame (33ms) para evitar seeks redundantes en cada tick
      if (Math.abs(lastTarget.current - target) > 0.033) {
        lastTarget.current = target;
        try {
          // fastSeek salta al keyframe más cercano: sin decode completo → sin tirones
          const v = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
          if (v.fastSeek) {
            v.fastSeek(target);
          } else {
            v.currentTime = target;
          }
        } catch {
          /* noop */
        }
      }
    };

    const onScroll = () => {
      if (!ticking.current) {
        rafId.current = requestAnimationFrame(() => {
          update();
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    const onResize = () => update();

    video.addEventListener("loadedmetadata", onMeta);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    if (video.readyState < 1) {
      video.load();
    } else {
      update();
    }

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      ticking.current = false;
      lastTarget.current = -1;
    };
  }, [sectionRef, videoRef, flags.isMobile, flags.isReducedMotion]);

  return {
    progress,
    isMobile: flags.isMobile,
    isReducedMotion: flags.isReducedMotion,
  };
}
