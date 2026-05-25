export interface RevealOutput {
  opacity: number;
  translateY: number;
}

/**
 * Mapea un progreso 0..1 a (opacidad, translateY) usando 4 puntos de control:
 *  - inStart..inEnd : fade-in (opacity 0→1, translateY 16→0)
 *  - inEnd..outStart: estable (opacity 1, translateY 0)
 *  - outStart..outEnd: fade-out (opacity 1→0, translateY 0→-8)
 *  - antes de inStart o después de outEnd: invisible
 */
export function lerpReveal(
  p: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number,
): RevealOutput {
  let opacity = 0;
  let phase: "in" | "stable" | "out" = "in";

  if (p <= inStart) {
    opacity = 0;
    phase = "in";
  } else if (p < inEnd) {
    opacity = (p - inStart) / Math.max(0.0001, inEnd - inStart);
    phase = "in";
  } else if (p < outStart) {
    opacity = 1;
    phase = "stable";
  } else if (p < outEnd) {
    opacity = 1 - (p - outStart) / Math.max(0.0001, outEnd - outStart);
    phase = "out";
  } else {
    opacity = 0;
    phase = "out";
  }

  const clamped = Math.max(0, Math.min(1, opacity));
  const translateY =
    phase === "in" ? (1 - clamped) * 16
    : phase === "out" ? -(1 - clamped) * 8
    : 0;

  return { opacity: clamped, translateY };
}
