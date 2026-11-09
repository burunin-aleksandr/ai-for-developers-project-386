import { intervalsIntersect } from "./intervals";

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

export type MonthSlots = {
  /** Первый день месяца (YYYY-MM-DD). */
  month: string;
  days: DaySlots[];
};

/** Интервал (ISO-строки UTC). */
export type TimeRange = {
  start: string;
  end: string;
};

/** Окно приёма в UTC+3 (захардкоженный дефолт). */
const WINDOW_START_MINUTES = 9 * 60; // 09:00
const WINDOW_END_MINUTES = 18 * 60; // 18:00
/** Длительность слота и шаг фиксированной сетки. */
export const SLOT_DURATION_MINUTES = 30;
const DISPLAY_UTC_OFFSET_HOURS = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Понедельник недели, в которую попадает дата (в UTC). */
export function mondayOf(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d;
}

/** Первый день месяца, в который попадает дата (в UTC). */
function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Минуты от полуночи в отображаемом поясе (UTC+3). */
function displayMinutesOf(d: Date): number {
  return (
    d.getUTCHours() * 60 +
    d.getUTCMinutes() +
    DISPLAY_UTC_OFFSET_HOURS * 60
  );
}

/**
 * Интервал лежит в окне 09:00–18:00 UTC+3 и не выходит за один день.
 * Возвращает true, если интервал корректен.
 */
export function isWithinBookingWindow(
  startIso: string,
  endIso: string,
): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  if (start.getTime() >= end.getTime()) return false;

  const startMinutes = displayMinutesOf(start);
  const endMinutes = displayMinutesOf(end);

  // конец в следующих сутках отображаемого пояса не влезает в окно одного дня
  const startDay = Math.floor(startMinutes / (24 * 60));
  const endDay = Math.floor(endMinutes / (24 * 60));
  if (startDay !== endDay) return false;

  const startInDay = startMinutes % (24 * 60);
  const endInDay = endMinutes % (24 * 60);

  return (
    startInDay >= WINDOW_START_MINUTES && endInDay <= WINDOW_END_MINUTES
  );
}

type MonthSlotsOptions = {
  /** События админа: слоты, пересекающиеся с ними, получают busy. */
  events?: TimeRange[];
  /** Занятые интервалы записей (UTC ISO): слот, пересекающий любой из них, получает busy. */
  busyIntervals?: TimeRange[];
  /** Текущий момент (для тестов). */
  now?: Date;
};

/**
 * Считает слоты месяца на лету: сетка 42 дня (6×7 пн–вс), начиная с
 * понедельника недели, в которую попадает 1-е число месяца.
 * Хранение в UTC, отображение в UTC+3: 09:00–18:00 UTC+3 = 06:00–15:00 UTC.
 * Сетка всегда фиксированная: шаг 30 минут. События админа и записи
 * помечают пересекающиеся слоты занятыми. Прошедшее время отсекается по `now`.
 */
export function monthSlots(
  date: string,
  {
    events = [],
    busyIntervals = [],
    now = new Date(),
  }: MonthSlotsOptions = {},
): MonthSlots {
  const month = monthStartOf(date);
  const gridStart = mondayOf(month);
  const days: DaySlots[] = [];

  const busyRanges = [...events, ...busyIntervals].map((range) => ({
    start: Date.parse(range.start),
    end: Date.parse(range.end),
  }));

  const statusOf = (startIso: string, endIso: string): Slot["status"] => {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    const busy = busyRanges.some((b) =>
      intervalsIntersect(start, end, b.start, b.end),
    );
    return busy ? "busy" : "free";
  };

  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setUTCDate(day.getUTCDate() + i);
    const dateStr = formatDate(day);
    const slots: Slot[] = [];

    for (
      let m = WINDOW_START_MINUTES;
      m < WINDOW_END_MINUTES;
      m += SLOT_DURATION_MINUTES
    ) {
      const start = new Date(day);
      start.setUTCMinutes(m - DISPLAY_UTC_OFFSET_HOURS * 60, 0, 0);
      const end = new Date(start);
      end.setUTCMinutes(start.getUTCMinutes() + SLOT_DURATION_MINUTES);

      if (start.getTime() < now.getTime()) continue;

      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        status: statusOf(start.toISOString(), end.toISOString()),
      });
    }

    days.push({
      date: dateStr,
      freeCount: slots.filter((s) => s.status === "free").length,
      slots,
    });
  }

  return { month, days };
}

/** Валидирует query-параметр даты. */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && formatDate(d) === value;
}

/**
 * Существует ли слот с таким началом в фиксированной сетке:
 * 30-минутная граница внутри окна 09:00–18:00 UTC+3, не в прошлом.
 */
export function isExistingSlotStart(
  slotStartIso: string,
  { now = new Date() }: { now?: Date } = {},
): boolean {
  const start = new Date(slotStartIso);
  if (Number.isNaN(start.getTime())) return false;
  if (start.getTime() < now.getTime()) return false;
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return false;
  }

  const minutes = displayMinutesOf(start);
  const displayDay = Math.floor(minutes / (24 * 60));
  const utcDay = Math.floor(
    (start.getUTCHours() * 60 + start.getUTCMinutes()) / (24 * 60),
  );
  if (displayDay !== utcDay) return false;

  const inDay = minutes % (24 * 60);
  return (
    inDay >= WINDOW_START_MINUTES &&
    inDay + SLOT_DURATION_MINUTES <= WINDOW_END_MINUTES &&
    inDay % SLOT_DURATION_MINUTES === 0
  );
}

/** Интервал фиксированного 30-минутного слота по его началу. */
export function slotInterval(slotStartIso: string): TimeRange | null {
  const start = Date.parse(slotStartIso);
  if (Number.isNaN(start)) return null;
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + SLOT_DURATION_MINUTES * 60_000).toISOString(),
  };
}
