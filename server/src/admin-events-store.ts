export type AdminEvent = {
  id: number;
  start: string;
  end: string;
};

export type AdminEventInput = {
  start: string;
  end: string;
};

/**
 * In-memory хранилище событий админа.
 * Состояние живёт только в памяти процесса — теряется при рестарте.
 */
export class AdminEventStore {
  private items = new Map<number, AdminEvent>();
  private nextId = 1;

  list(): AdminEvent[] {
    return [...this.items.values()];
  }

  create(input: AdminEventInput): AdminEvent {
    const event: AdminEvent = { id: this.nextId++, ...input };
    this.items.set(event.id, event);
    return event;
  }

  remove(id: number): boolean {
    return this.items.delete(id);
  }
}
