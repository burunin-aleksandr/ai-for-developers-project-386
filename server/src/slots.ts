export type Slot = {
  start: string;
  end: string;
  status: "free" | "busy";
};

export type DaySlots = {
  date: string;
  freeCount: number;
  slots: Slot[];
};

export type WeekSlots = {
  weekStart: string;
  days: DaySlots[];
};

/** Окно приёма в UTC+3 (захардкоженный дефолт). */
const WINDOW_START_MINUTES = 10 * 60; // 10:00
const WINDOW_END_MINUTES = 18 * 60; // 18:00
const SLOT_STEP_MINUTES = 15;
const DISPLAY_UTC_OFFSET_HOURS = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Понедельник недели, в которую попадает дата (в UTC). */
export function mondayOf(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Считает слоты недели на лету.
 * Хранение в UTC, отображение в UTC+3: 10:00–18:00 UTC+3 = 07:00–15:00 UTC.
 * Прошедшее время отсекается по `now`.
 */
export function weekSlots(date: string, now = new Date()): WeekSlots {
  const weekStart = mondayOf(date);
  const days: DaySlots[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + i);
    const dateStr = formatDate(day);

    const slots: Slot[] = [];
    for (
      let m = WINDOW_START_MINUTES;
      m < WINDOW_END_MINUTES;
      m += SLOT_STEP_MINUTES
    ) {
      const start = new Date(day);
      start.setUTCMinutes(
        m - DISPLAY_UTC_OFFSET_HOURS * 60,
        0,
        0,
      );
      const end = new Date(start);
      end.setUTCMinutes(start.getUTCMinutes() + SLOT_STEP_MINUTES);

      if (start.getTime() < now.getTime()) continue;

      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        status: "free",
      });
    }

    days.push({
      date: dateStr,
      freeCount: slots.length,
      slots,
    });
  }

  return { weekStart: formatDate(weekStart), days };
}

/** Валидирует query-параметр даты. */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && formatDate(d) === value;
}
