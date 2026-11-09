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

/** Интервал события админа (ISO-строки UTC). */
export type TimeRange = {
  start: string;
  end: string;
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

/** Первый день месяца, в который попадает дата (в UTC). */
function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Интервал лежит в окне 10:00–18:00 UTC+3 и не выходит за один день.
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

  // минуты от полуночи в отображаемом поясе (UTC+3)
  const startMinutes =
    start.getUTCHours() * 60 +
    start.getUTCMinutes() +
    DISPLAY_UTC_OFFSET_HOURS * 60;
  const endMinutes =
    end.getUTCHours() * 60 +
    end.getUTCMinutes() +
    DISPLAY_UTC_OFFSET_HOURS * 60;

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
  /** События админа; когда есть — дефолтная сетка не строится. */
  events?: TimeRange[];
  /** Шаг нарезки событий (длительность выбранного типа встречи). */
  durationMinutes?: number;
  /** Занятые интервалы записей (UTC ISO): слот, пересекающий любой из них, получает busy. */
  busyIntervals?: Array<{ start: string; end: string }>;
  /** Текущий момент (для тестов). */
  now?: Date;
};

/**
 * Считает слоты месяца на лету: сетка 42 дня (6×7 пн–вс), начиная с
 * понедельника недели, в которую попадает 1-е число месяца.
 * Хранение в UTC, отображение в UTC+3: 10:00–18:00 UTC+3 = 07:00–15:00 UTC.
 * Есть события админа — слоты нарезаются только из них с шагом durationMinutes;
 * иначе — дефолтная 15-минутная сетка. Прошедшее время отсекается по `now`.
 */
export function monthSlots(
  date: string,
  {
    events,
    durationMinutes,
    busyIntervals,
    now = new Date(),
  }: MonthSlotsOptions = {},
): MonthSlots {
  const month = monthStartOf(date);
  const gridStart = mondayOf(month);
  const days: DaySlots[] = [];
  const step = durationMinutes ?? SLOT_STEP_MINUTES;

  // слот занят, если пересекается с любой записью (антидубль для разных длительностей)
  const statusOf = (startIso: string, endIso: string): Slot["status"] => {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    const busy = busyIntervals?.some((b) =>
      intervalsIntersect(start, end, Date.parse(b.start), Date.parse(b.end)),
    );
    return busy ? "busy" : "free";
  };

  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setUTCDate(day.getUTCDate() + i);
    const dateStr = formatDate(day);

    const slots: Slot[] = [];

    if (events && events.length > 0) {
      const seenStarts = new Set<string>();
      for (const event of events) {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        if (formatDate(eventStart) !== dateStr) continue;

        for (
          let t = eventStart.getTime();
          t + step * 60_000 <= eventEnd.getTime();
          t += step * 60_000
        ) {
          const start = new Date(t);
          if (start.getTime() < now.getTime()) continue;
          // пересекающиеся события не должны давать дубликаты слотов
          if (seenStarts.has(start.toISOString())) continue;
          seenStarts.add(start.toISOString());
          const end = new Date(t + step * 60_000);
          slots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            status: statusOf(start.toISOString(), end.toISOString()),
          });
        }
      }
      slots.sort((a, b) => a.start.localeCompare(b.start));
    } else {
      for (
        let m = WINDOW_START_MINUTES;
        m < WINDOW_END_MINUTES;
        m += SLOT_STEP_MINUTES
      ) {
        const start = new Date(day);
        start.setUTCMinutes(m - DISPLAY_UTC_OFFSET_HOURS * 60, 0, 0);
        const end = new Date(start);
        end.setUTCMinutes(start.getUTCMinutes() + SLOT_STEP_MINUTES);

        if (start.getTime() < now.getTime()) continue;

        slots.push({
          start: start.toISOString(),
          end: end.toISOString(),
          status: statusOf(start.toISOString(), end.toISOString()),
        });
      }
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
 * Существует ли слот с таким началом в сетке месяца даты
 * (с учётом событий админа) — бронируется только целый слот.
 */
export function isExistingSlotStart(
  slotStartIso: string,
  events: TimeRange[],
  {
    durationMinutes,
    now,
  }: { durationMinutes?: number; now?: Date } = {},
): boolean {
  const start = new Date(slotStartIso);
  if (Number.isNaN(start.getTime())) return false;

  const grid = monthSlots(formatDate(start), { events, durationMinutes, now });
  return grid.days.some((day) =>
    day.slots.some((slot) => slot.start === start.toISOString()),
  );
}
