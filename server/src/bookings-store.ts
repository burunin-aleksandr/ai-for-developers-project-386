import { intervalsIntersect } from "./intervals";

export type Booking = {
  id: number;
  slotStart: string;
  meetingTypeId: number;
  /** Снимок длительности типа на момент брони — по нему считается интервал. */
  durationMinutes: number;
  name: string;
  email: string;
  comment?: string;
};

export type BookingDraft = {
  slotStart: string;
  meetingTypeId: number;
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

  /** Предстоящие записи (начало позже now), по возрастанию времени. */
  listUpcoming(now: Date): Booking[] {
    return [...this.items.values()]
      .filter((b) => Date.parse(b.slotStart) > now.getTime())
      .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  }

  create(input: BookingDraft): Booking {
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
