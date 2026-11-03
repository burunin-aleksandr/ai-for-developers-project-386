import { intervalsIntersect } from "./intervals";

export type Booking = {
  id: number;
  slotStart: string;
  /** Длительность типа встречи — по ней считается занятый интервал. */
  durationMinutes: number;
  name: string;
  email: string;
  comment?: string;
};

export type BookingInput = {
  slotStart: string;
  durationMinutes: number;
  name: string;
  email: string;
  comment?: string;
};

/** Интервал занятости записи (миллисекунды UTC). */
type Interval = { start: number; end: number };

function intervalOf(slotStart: string, durationMinutes: number): Interval {
  const start = Date.parse(slotStart);
  return { start, end: start + durationMinutes * 60_000 };
}

/**
 * In-memory хранилище записей на слоты.
 * Состояние живёт только в памяти процесса — теряется при рестарте.
 */
export class BookingStore {
  private items = new Map<number, Booking>();
  private nextId = 1;

  list(): Booking[] {
    return [...this.items.values()];
  }

  create(input: BookingInput): Booking {
    const booking: Booking = { id: this.nextId++, ...input };
    this.items.set(booking.id, booking);
    return booking;
  }

  /** Занят ли указанный интервал любой существующей записью (антидубль). */
  overlaps(slotStart: string, durationMinutes: number): boolean {
    const candidate = intervalOf(slotStart, durationMinutes);
    return [...this.items.values()].some((b) => {
      const other = intervalOf(b.slotStart, b.durationMinutes);
      return intervalsIntersect(
        candidate.start,
        candidate.end,
        other.start,
        other.end,
      );
    });
  }

  /** Все занятые интервалы (UTC ISO) — для статуса слотов в сетке. */
  busyIntervals(): Array<{ start: string; end: string }> {
    return [...this.items.values()].map((b) => {
      const { start, end } = intervalOf(b.slotStart, b.durationMinutes);
      return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    });
  }
}
