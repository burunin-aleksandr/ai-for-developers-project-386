export type MeetingType = {
  id: number;
  name: string;
  description?: string;
  durationMinutes: 15 | 30 | 45 | 60;
};

export type MeetingTypeInput = {
  name: string;
  description?: string;
  durationMinutes: 15 | 30 | 45 | 60;
};

/**
 * In-memory хранилище типов встреч.
 * Состояние живёт только в памяти процесса — теряется при рестарте.
 */
export class MeetingTypeStore {
  private items = new Map<number, MeetingType>();
  private nextId = 1;

  list(): MeetingType[] {
    return [...this.items.values()];
  }

  get(id: number): MeetingType | undefined {
    return this.items.get(id);
  }

  create(input: MeetingTypeInput): MeetingType {
    const meetingType: MeetingType = { id: this.nextId++, ...input };
    this.items.set(meetingType.id, meetingType);
    return meetingType;
  }

  update(id: number, input: MeetingTypeInput): MeetingType | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;

    const updated: MeetingType = { ...existing, ...input };
    this.items.set(id, updated);
    return updated;
  }
}
