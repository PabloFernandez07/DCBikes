export interface DaySchedule {
  label: string;
  morning: string | null;
  afternoon: string | null;
}

export const SCHEDULE: DaySchedule[] = [
  { label: "Lunes",     morning: "09:30–14:00", afternoon: "16:30–20:00" },
  { label: "Martes",    morning: "09:30–14:00", afternoon: "16:30–20:00" },
  { label: "Miércoles", morning: "09:30–14:00", afternoon: "16:30–20:00" },
  { label: "Jueves",    morning: "09:30–14:00", afternoon: "16:30–20:00" },
  { label: "Viernes",   morning: "09:30–14:00", afternoon: "16:30–20:00" },
  { label: "Sábado",    morning: "10:00–14:00", afternoon: null },
  { label: "Domingo",   morning: null,           afternoon: null },
];

function parseTime(str: string): { h: number; m: number } {
  const [h, m] = str.split(":").map(Number);
  return { h, m };
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

export function isOpenNow(): boolean {
  const now = new Date();
  const dow = now.getDay(); // 0=domingo … 6=sábado
  const idx = dow === 0 ? 6 : dow - 1; // convertir a nuestro array (0=lunes … 6=domingo)
  const day = SCHEDULE[idx];

  const currentMin = toMinutes(now.getHours(), now.getMinutes());

  function inRange(slot: string | null): boolean {
    if (!slot) return false;
    const [start, end] = slot.split("–");
    const s = parseTime(start);
    const e = parseTime(end);
    return currentMin >= toMinutes(s.h, s.m) && currentMin < toMinutes(e.h, e.m);
  }

  return inRange(day.morning) || inRange(day.afternoon);
}

export function todayLabel(): string {
  const dow = new Date().getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return SCHEDULE[idx].label;
}
