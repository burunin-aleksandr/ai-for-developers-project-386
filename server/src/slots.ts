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

type WeekSlotsOptions = {
  /** События админа; когда есть — дефолтная сетка не строится. */
  events?: TimeRange[];
  /** Шаг нарезки событий (длительность выбранного типа встречи). */
  durationMinutes?: number;
  /** Начало забронированных слотов (UTC ISO) — они получают статус busy. */
  busyStarts?: Set<string>;
  /** Текущий момент (для тестов). */
  now?: Date;
};

/**
 * Считает слоты недели на лету.
 * Хранение в UTC, отображение в UTC+3: 10:00–18:00 UTC+3 = 07:00–15:00 UTC.
 * Есть события админа — слоты нарезаются только из них с шагом durationMinutes;
 * иначе — дефолтная 15-минутная сетка. Прошедшее время отсекается по `now`.
 */
export function weekSlots(
  date: string,
  {
    events,
    durationMinutes,
    busyStarts,
    now = new Date(),
  }: WeekSlotsOptions = {},
): WeekSlots {
  const weekStart = mondayOf(date);
  const days: DaySlots[] = [];
  const step = durationMinutes ?? SLOT_STEP_MINUTES;

  const statusOf = (startIso: string): Slot["status"] =>
    busyStarts?.has(startIso) ? "busy" : "free";

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
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
            status: statusOf(start.toISOString()),
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
          status: statusOf(start.toISOString()),
        });
      }
    }

    days.push({
      date: dateStr,
      freeCount: slots.filter((s) => s.status === "free").length,
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

/**
 * Существует ли слот с таким началом в указанной неделе
 * (с учётом событий админа) — бронируется только целый слот.
 */
export function isExistingSlotStart(
  slotStartIso: string,
  events: TimeRange[],
  durationMinutes?: number,
): boolean {
  const start = new Date(slotStartIso);
  if (Number.isNaN(start.getTime())) return false;

  const week = weekSlots(formatDate(start), { events, durationMinutes });
  return week.days.some((day) =>
    day.slots.some((slot) => slot.start === start.toISOString()),
  );
}
