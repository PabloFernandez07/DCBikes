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
  { label: "Sábado",    morning: null,          afternoon: null },
  { label: "Domingo",   morning: null,          afternoon: null },
];

function parseTime(str: string): { h: number; m: number } {
  const [h, m] = str.split(":").map(Number);
  return { h, m };
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

function dowIndex(): number {
  const dow = new Date().getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function computeIsOpen(schedule: DaySchedule[]): boolean {
  const day = schedule[dowIndex()];
  if (!day) return false;
  const currentMin = toMinutes(new Date().getHours(), new Date().getMinutes());

  function inRange(slot: string | null): boolean {
    if (!slot) return false;
    const [start, end] = slot.split("–");
    const s = parseTime(start.trim());
    const e = parseTime(end.trim());
    return currentMin >= toMinutes(s.h, s.m) && currentMin < toMinutes(e.h, e.m);
  }

  return inRange(day.morning) || inRange(day.afternoon);
}

export function computeTodayLabel(schedule: DaySchedule[]): string {
  return schedule[dowIndex()]?.label ?? "";
}

export function isOpenNow(): boolean {
  return computeIsOpen(SCHEDULE);
}

export function todayLabel(): string {
  return computeTodayLabel(SCHEDULE);
}
