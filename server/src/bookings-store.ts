export type Booking = {
  id: number;
  slotStart: string;
  name: string;
  email: string;
  comment?: string;
};

export type BookingInput = {
  slotStart: string;
  name: string;
  email: string;
  comment?: string;
};

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

  /** Слоты, отмеченные как занятые (start-время в UTC ISO). */
  busyStarts(): Set<string> {
    return new Set([...this.items.values()].map((b) => b.slotStart));
  }
}
