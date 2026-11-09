import { intervalsIntersect } from "./intervals";
import { SLOT_DURATION_MINUTES, type TimeRange } from "./slots";

export type Booking = {
  id: number;
  slotStart: string;
  name: string;
  email: string;
  createdAt: string;
};

export type BookingDraft = {
  slotStart: string;
  name: string;
  email: string;
};

/** Интервал занятости записи (миллисекунды UTC). */
type Interval = { start: number; end: number };

function intervalOf(slotStart: string): Interval {
  const start = Date.parse(slotStart);
  return { start, end: start + SLOT_DURATION_MINUTES * 60_000 };
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

  create(input: BookingDraft, now: Date): Booking {
    const booking: Booking = {
      id: this.nextId++,
      ...input,
      createdAt: now.toISOString(),
    };
    this.items.set(booking.id, booking);
    return booking;
  }

  /** Занят ли указанный слот любой существующей записью (антидубль). */
  overlaps(slotStart: string): boolean {
    const candidate = intervalOf(slotStart);
    return [...this.items.values()].some((b) => {
      const other = intervalOf(b.slotStart);
      return intervalsIntersect(
        candidate.start,
        candidate.end,
        other.start,
        other.end,
      );
    });
  }

  /** Все занятые интервалы (UTC ISO) — для статуса слотов в сетке. */
  busyIntervals(): TimeRange[] {
    return [...this.items.values()].map((b) => {
      const { start, end } = intervalOf(b.slotStart);
      return {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      };
    });
  }
}
