import { useEffect, useState } from "react";
import type { components } from "./api/schema";
import {
  DISPLAY_UTC_OFFSET_HOURS,
  fmtDate,
  fmtTime,
  plusDays,
  todayInDisplayZone,
} from "./dates";

type MeetingType = components["schemas"]["MeetingType"];
type MeetingTypeInput = components["schemas"]["MeetingTypeInput"];
type WeekSlots = components["schemas"]["WeekSlots"];
type Slot = components["schemas"]["Slot"];
type AdminEvent = components["schemas"]["AdminEvent"];

const DURATIONS = [15, 30, 45, 60] as const;

const EMPTY_FORM: MeetingTypeInput = {
  name: "",
  durationMinutes: 15,
};

type View = "booking" | "admin";

const STATUS_LABELS: Record<Slot["status"], string> = {
  free: "Свободно",
  busy: "Занято",
};

export default function App({ baseUrl = "" }: { baseUrl?: string }) {
  const [view, setView] = useState<View>("booking");
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [editing, setEditing] = useState<MeetingType | "new" | null>(null);
  const [form, setForm] = useState<MeetingTypeInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null);
  const [weekDate, setWeekDate] = useState<string>(todayInDisplayZone);
  const [week, setWeek] = useState<WeekSlots | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);
  const [eventForm, setEventForm] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [eventError, setEventError] = useState<string | null>(null);
  // бамп при изменении событий — чтобы календарь гостя перезапросился
  const [eventsVersion, setEventsVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((data) => {
        if (!cancelled) setMeetingTypes(data);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    void loadEvents()
      .then((data) => {
        if (!cancelled) setAdminEvents(data);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(): Promise<MeetingType[]> {
    const res = await fetch(`${baseUrl}/meeting-types`);
    const data = (await res.json()) as { meetingTypes: MeetingType[] };
    return data.meetingTypes;
  }

  async function loadEvents(): Promise<AdminEvent[]> {
    const res = await fetch(`${baseUrl}/admin-events`);
    const data = (await res.json()) as { adminEvents: AdminEvent[] };
    return data.adminEvents;
  }

  /** Слоты недели считаются на лету при смене недели. День открыт по умолчанию — первый с слотами. */
  useEffect(() => {
    if (!selectedType) {
      setWeek(null);
      setSelectedDay(null);
      return;
    }
    let cancelled = false;
    fetch(
      `${baseUrl}/slots?date=${weekDate}&durationMinutes=${selectedType.durationMinutes}`,
    )
      .then((res) => res.json())
      .then((data: WeekSlots) => {
        if (cancelled) return;
        setWeek(data);
        setSelectedDay(
          (prev) =>
            (prev && data.days.some((d) => d.date === prev)
              ? prev
              : (data.days.find((d) => d.slots.length > 0)?.date ??
                data.days[0]?.date ??
                null)) ?? null,
        );
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, weekDate, eventsVersion]);

  async function save() {
    if (!editing) return;
    const method = editing === "new" ? "POST" : "PUT";
    const url =
      editing === "new"
        ? `${baseUrl}/meeting-types`
        : `${baseUrl}/meeting-types/${editing.id}`;

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      setFormError(body?.message ?? `Ошибка сохранения (${res.status})`);
      return;
    }

    setEditing(null);
    setFormError(null);
    setForm(EMPTY_FORM);
    setMeetingTypes(await load());
  }

  /** datetime-local значение (UTC+3) → UTC ISO для API. */
  function toUtcIso(localValue: string): string {
    const offset = String(DISPLAY_UTC_OFFSET_HOURS).padStart(2, "0");
    return new Date(`${localValue}:00+${offset}:00`).toISOString();
  }

  async function saveEvent() {
    if (!eventForm) return;
    const res = await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: toUtcIso(eventForm.start),
        end: toUtcIso(eventForm.end),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      setEventError(body?.message ?? `Ошибка сохранения (${res.status})`);
      return;
    }

    setEventForm(null);
    setEventError(null);
    setAdminEvents(await loadEvents());
    setEventsVersion((v) => v + 1);
  }

  async function deleteEvent(id: number) {
    const res = await fetch(`${baseUrl}/admin-events/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setAdminEvents(await loadEvents());
    setEventsVersion((v) => v + 1);
  }

  return (
    <main>
      <header>
        <h1>Calendar</h1>
        <nav>
          <button
            type="button"
            onClick={() => setView("booking")}
            aria-current={view === "booking" ? "page" : undefined}
          >
            Записаться
          </button>
          <button
            type="button"
            onClick={() => setView("admin")}
            aria-current={view === "admin" ? "page" : undefined}
          >
            Админка
          </button>
        </nav>
      </header>

      {view === "booking" ? (
        <section aria-label="Записаться">
          {meetingTypes.length === 0 ? (
            <p>Типы встреч не созданы</p>
          ) : selectedType ? (
            <div>
              <h2>{selectedType.name}</h2>
              <button type="button" onClick={() => setSelectedType(null)}>
                К списку типов
              </button>

              <nav aria-label="Неделя">
                <button
                  type="button"
                  onClick={() => setWeekDate((d) => plusDays(d, -7))}
                >
                  ←
                </button>
                <span>
                  {week
                    ? `${fmtDate(week.weekStart)} — ${fmtDate(
                        plusDays(week.weekStart, 6),
                      )}`
                    : "Загрузка…"}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekDate((d) => plusDays(d, 7))}
                >
                  →
                </button>
              </nav>

              {week && (
                <ul aria-label="Дни недели">
                  {week.days.map((day) => (
                    <li key={day.date}>
                      <button
                        type="button"
                        aria-pressed={selectedDay === day.date}
                        onClick={() => setSelectedDay(day.date)}
                      >
                        <span>{fmtDate(day.date)}</span>
                        <span>Свободно: {day.freeCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {week && selectedDay && (
                <ul aria-label="Слоты">
                  {week.days
                    .find((d) => d.date === selectedDay)
                    ?.slots.map((slot) => (
                      <li key={slot.start}>
                        <span>{fmtTime(slot.start)}</span>
                        <span>{STATUS_LABELS[slot.status]}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <ul>
              {meetingTypes.map((t) => (
                <li key={t.id}>
                  <h2>{t.name}</h2>
                  {t.description && <p>{t.description}</p>}
                  <span>{t.durationMinutes} мин</span>
                  <button
                    type="button"
                    onClick={() => setSelectedType(t)}
                  >
                    Выбрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Админка">
          <button
            type="button"
            onClick={() => {
              setEditing("new");
              setForm(EMPTY_FORM);
              setFormError(null);
            }}
          >
            Создать тип встречи
          </button>

          <ul>
            {meetingTypes.map((t) => (
              <li key={t.id}>
                <h2>{t.name}</h2>
                <span>{t.durationMinutes} мин</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(t);
                    setFormError(null);
                    setForm({
                      name: t.name,
                      description: t.description,
                      durationMinutes: t.durationMinutes,
                    });
                  }}
                >
                  Редактировать
                </button>
              </li>
            ))}
          </ul>

          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                Название
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </label>
              <label>
                Описание
                <input
                  value={form.description ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      description: e.target.value || undefined,
                    }))
                  }
                />
              </label>
              <label>
                Длительность
                <select
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationMinutes: Number(e.target.value) as
                        | 15
                        | 30
                        | 45
                        | 60,
                    }))
                  }
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} минут
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">Сохранить</button>
              {formError && <p role="alert">{formError}</p>}
            </form>
          )}

          <h3>События админа</h3>
          <button
            type="button"
            onClick={() => {
              setEventForm({ start: "", end: "" });
              setEventError(null);
            }}
          >
            Создать событие
          </button>

          <ul>
            {adminEvents.map((e) => (
              <li key={e.id}>
                <span>
                  {fmtTime(e.start)} — {fmtTime(e.end)}
                </span>
                <button type="button" onClick={() => void deleteEvent(e.id)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>

          {eventForm && (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                void saveEvent();
              }}
            >
              <label>
                Начало
                <input
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(ev) =>
                    setEventForm((f) =>
                      f ? { ...f, start: ev.target.value } : f,
                    )
                  }
                />
              </label>
              <label>
                Конец
                <input
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(ev) =>
                    setEventForm((f) =>
                      f ? { ...f, end: ev.target.value } : f,
                    )
                  }
                />
              </label>
              <button type="submit">Сохранить</button>
              {eventError && <p role="alert">{eventError}</p>}
            </form>
          )}
        </section>
      )}
    </main>
  );
}
