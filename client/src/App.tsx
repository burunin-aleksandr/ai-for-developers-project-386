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
type UpcomingBooking = components["schemas"]["UpcomingBooking"];

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

// общие стили (Tailwind) — визуальный слой, на разметку и доступные имена не влияет
const BTN_PRIMARY =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700";
const BTN_SECONDARY =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
const INPUT =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none";
const LABEL = "block text-sm font-medium";
const CARD = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const ROW =
  "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm";
const ALERT_ERROR =
  "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700";
const SECTION_TITLE = "text-lg font-semibold text-slate-900";

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
  const [slotsRevision, setSlotsRevision] = useState(0);
  // двухшаговое бронирование: слот → форма → успех
  const [bookingStep, setBookingStep] = useState<
    "idle" | "form" | "success"
  >("idle");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [bookingForm, setBookingForm] = useState({
    name: "",
    email: "",
    comment: "",
  });
  const [bookingError, setBookingError] = useState<string | null>(null);
  // предстоящие записи для админа (только просмотр)
  const [upcomingBookings, setUpcomingBookings] = useState<
    UpcomingBooking[]
  >([]);

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

  // список предстоящих записей загружается при открытии админки
  useEffect(() => {
    if (view !== "admin") return;
    let cancelled = false;
    void fetch(`${baseUrl}/bookings`)
      .then((res) => res.json())
      .then((data: { bookings: UpcomingBooking[] }) => {
        if (!cancelled) setUpcomingBookings(data.bookings);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [view, baseUrl]);

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
  }, [selectedType, weekDate, slotsRevision]);

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
    setSlotsRevision((v) => v + 1);
  }

  async function deleteEvent(id: number) {
    const res = await fetch(`${baseUrl}/admin-events/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setAdminEvents(await loadEvents());
    setSlotsRevision((v) => v + 1);
  }

  async function submitBooking() {
    if (!selectedSlot || !selectedType) return;
    if (!bookingForm.name.trim() || !bookingForm.email.trim()) {
      setBookingError("Заполните имя и email");
      return;
    }

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slotStart: selectedSlot.start,
        meetingTypeId: selectedType.id,
        name: bookingForm.name,
        email: bookingForm.email,
        ...(bookingForm.comment ? { comment: bookingForm.comment } : {}),
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      // конфликт занятости: возвращаем гостя к выбору слота с сообщением
      if (res.status === 409) {
        setBookingError(body?.message ?? "Слот уже занят — выберите другой");
        setBookingStep("idle");
        setSelectedSlot(null);
        setSlotsRevision((v) => v + 1); // перерисовать сетку: слот теперь занят
        return;
      }
      setBookingError(body?.message ?? `Ошибка записи (${res.status})`);
      return;
    }

    setBookingError(null);
    setBookingStep("success");
    setSlotsRevision((v) => v + 1);
  }

  function resetBooking() {
    setBookingStep("idle");
    setSelectedSlot(null);
    setBookingError(null);
    setBookingForm({ name: "", email: "", comment: "" });
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Calendar</h1>
        <nav className="flex gap-2">
          <button
            type="button"
            onClick={() => setView("booking")}
            aria-current={view === "booking" ? "page" : undefined}
            className={
              view === "booking"
                ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            }
          >
            Записаться
          </button>
          <button
            type="button"
            onClick={() => setView("admin")}
            aria-current={view === "admin" ? "page" : undefined}
            className={
              view === "admin"
                ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            }
          >
            Админка
          </button>
        </nav>
      </header>

      {view === "booking" ? (
        <section aria-label="Записаться" className="mx-auto max-w-3xl px-6 py-8">
          {meetingTypes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Типы встреч не созданы
            </p>
          ) : selectedType ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-2xl font-semibold">{selectedType.name}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className={BTN_SECONDARY}
                >
                  К списку типов
                </button>
              </div>

              <nav
                aria-label="Неделя"
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setWeekDate((d) => plusDays(d, -7))}
                  className="rounded-lg px-3 py-1 text-lg text-slate-600 hover:bg-slate-100"
                >
                  ←
                </button>
                <span className="font-medium tabular-nums">
                  {week
                    ? `${fmtDate(week.weekStart)} — ${fmtDate(
                        plusDays(week.weekStart, 6),
                      )}`
                    : "Загрузка…"}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekDate((d) => plusDays(d, 7))}
                  className="rounded-lg px-3 py-1 text-lg text-slate-600 hover:bg-slate-100"
                >
                  →
                </button>
              </nav>

              {week && (
                <ul
                  aria-label="Дни недели"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
                >
                  {week.days.map((day) => (
                    <li key={day.date}>
                      <button
                        type="button"
                        aria-pressed={selectedDay === day.date}
                        onClick={() => setSelectedDay(day.date)}
                        className={`flex w-full flex-col gap-1 rounded-lg border p-3 text-left transition ${
                          selectedDay === day.date
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-300"
                        }`}
                      >
                        <span className="text-sm font-medium tabular-nums">
                          {fmtDate(day.date)}
                        </span>
                        <span
                          className={`text-xs ${
                            day.freeCount > 0
                              ? "text-emerald-600"
                              : "text-slate-500"
                          }`}
                        >
                          Свободно: {day.freeCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {week && selectedDay && (
                <ul
                  aria-label="Слоты"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
                >
                  {week.days
                    .find((d) => d.date === selectedDay)
                    ?.slots.map((slot) => (
                      <li key={slot.start}>
                        <button
                          type="button"
                          disabled={slot.status === "busy"}
                          aria-pressed={selectedSlot?.start === slot.start}
                          onClick={() => {
                            setSelectedSlot(slot);
                            setBookingStep("idle");
                            setBookingError(null);
                          }}
                          className={`flex w-full flex-col gap-1 rounded-lg border p-2 text-left transition ${
                            slot.status === "busy"
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600"
                              : selectedSlot?.start === slot.start
                                ? "border-blue-600 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <span className="text-sm font-medium tabular-nums">
                            {fmtTime(slot.start)}
                          </span>
                          <span
                            className={`text-xs ${
                              slot.status === "busy"
                                ? "text-slate-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {STATUS_LABELS[slot.status]}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              {/* сообщение о занятости после 409 — гость снова выбирает слот */}
              {bookingStep === "idle" && !selectedSlot && bookingError && (
                <p
                  role="alert"
                  className={`mt-3 ${ALERT_ERROR}`}
                >
                  {bookingError}
                </p>
              )}

              {selectedSlot && bookingStep === "idle" && (
                <section
                  aria-label="Выбранный слот"
                  className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm"
                >
                  <dl className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-600">Выбранная дата</dt>
                      <dd className="font-semibold tabular-nums">
                        {fmtDate(selectedSlot.start.slice(0, 10))}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-600">Выбранное время</dt>
                      <dd className="font-semibold tabular-nums">
                        {fmtTime(selectedSlot.start)}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => setBookingStep("form")}
                    className={BTN_PRIMARY}
                  >
                    Продолжить
                  </button>
                </section>
              )}

              {selectedSlot && bookingStep === "form" && (
                <form
                  aria-label="Форма записи"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitBooking();
                  }}
                  className={`${CARD} space-y-4`}
                >
                  <label className={LABEL}>
                    Имя
                    <input
                      value={bookingForm.name}
                      onChange={(e) =>
                        setBookingForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className={INPUT}
                    />
                  </label>
                  <label className={LABEL}>
                    Email
                    <input
                      type="email"
                      value={bookingForm.email}
                      onChange={(e) =>
                        setBookingForm((f) => ({
                          ...f,
                          email: e.target.value,
                        }))
                      }
                      className={INPUT}
                    />
                  </label>
                  <label className={LABEL}>
                    Комментарий
                    <input
                      value={bookingForm.comment}
                      onChange={(e) =>
                        setBookingForm((f) => ({
                          ...f,
                          comment: e.target.value,
                        }))
                      }
                      className={INPUT}
                    />
                  </label>
                  <button type="submit" className={BTN_PRIMARY}>
                    Записаться
                  </button>
                  {bookingError && (
                    <p
                      role="alert"
                      className={ALERT_ERROR}
                    >
                      {bookingError}
                    </p>
                  )}
                </form>
              )}

              {bookingStep === "success" && selectedSlot && (
                <section
                  aria-label="Успех"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm"
                >
                  <p className="mb-4 text-lg font-semibold text-emerald-800">
                    Вы записаны
                  </p>
                  <dl className="mb-5 space-y-1 text-sm text-slate-700">
                    <div>
                      <dt className="inline text-slate-500">Тип: </dt>
                      <dd className="inline font-semibold">
                        {selectedType.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">Дата: </dt>
                      <dd className="inline font-semibold tabular-nums">
                        {fmtDate(selectedSlot.start.slice(0, 10))}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">Время: </dt>
                      <dd className="inline font-semibold tabular-nums">
                        {fmtTime(selectedSlot.start)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">
                        Длительность:{" "}
                      </dt>
                      <dd className="inline font-semibold">
                        {selectedType.durationMinutes} мин
                      </dd>
                    </div>
                  </dl>
                  <button type="button" onClick={resetBooking} className={BTN_PRIMARY}>
                    К календарю
                  </button>
                </section>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {meetingTypes.map((t) => (
                <li
                  key={t.id}
                  className={`${CARD} flex flex-col gap-2`}
                >
                  <h2 className="text-lg font-semibold">{t.name}</h2>
                  {t.description && (
                    <p className="text-sm text-slate-500">{t.description}</p>
                  )}
                  <span className="text-sm text-slate-600">
                    {t.durationMinutes} мин
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`mt-auto ${BTN_PRIMARY}`}
                  >
                    Выбрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Админка" className="mx-auto max-w-3xl px-6 py-8">
          <button
            type="button"
            onClick={() => {
              setEditing("new");
              setForm(EMPTY_FORM);
              setFormError(null);
            }}
            className={BTN_PRIMARY}
          >
            Создать тип встречи
          </button>

          <ul className="mt-4 space-y-2">
            {meetingTypes.map((t) => (
              <li
                key={t.id}
                className={ROW}
              >
                <div>
                  <h2 className={SECTION_TITLE}>{t.name}</h2>
                  <span className="text-sm text-slate-500">
                    {t.durationMinutes} мин
                  </span>
                </div>
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
                  className={BTN_SECONDARY}
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
              className={`mt-4 ${CARD} space-y-4`}
            >
              <label className={LABEL}>
                Название
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className={INPUT}
                />
              </label>
              <label className={LABEL}>
                Описание
                <input
                  value={form.description ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      description: e.target.value || undefined,
                    }))
                  }
                  className={INPUT}
                />
              </label>
              <label className={LABEL}>
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
                  className={INPUT}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} минут
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={BTN_PRIMARY}>
                Сохранить
              </button>
              {formError && (
                <p
                  role="alert"
                  className={ALERT_ERROR}
                >
                  {formError}
                </p>
              )}
            </form>
          )}

          <h3 className={`mt-8 border-b border-slate-200 pb-2 ${SECTION_TITLE}`}>
            События админа
          </h3>
          <button
            type="button"
            onClick={() => {
              setEventForm({ start: "", end: "" });
              setEventError(null);
            }}
            className={`mt-3 ${BTN_SECONDARY}`}
          >
            Создать событие
          </button>

          <ul className="mt-3 space-y-2">
            {adminEvents.map((e) => (
              <li
                key={e.id}
                className={ROW}
              >
                <span className="text-sm font-medium tabular-nums">
                  {fmtTime(e.start)} — {fmtTime(e.end)}
                </span>
                <button
                  type="button"
                  onClick={() => void deleteEvent(e.id)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
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
              className={`mt-4 ${CARD} space-y-4`}
            >
              <label className={LABEL}>
                Начало
                <input
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(ev) =>
                    setEventForm((f) =>
                      f ? { ...f, start: ev.target.value } : f,
                    )
                  }
                  className={INPUT}
                />
              </label>
              <label className={LABEL}>
                Конец
                <input
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(ev) =>
                    setEventForm((f) =>
                      f ? { ...f, end: ev.target.value } : f,
                    )
                  }
                  className={INPUT}
                />
              </label>
              <button type="submit" className={BTN_PRIMARY}>
                Сохранить
              </button>
              {eventError && (
                <p
                  role="alert"
                  className={ALERT_ERROR}
                >
                  {eventError}
                </p>
              )}
            </form>
          )}

          <h3 className={`mt-8 border-b border-slate-200 pb-2 ${SECTION_TITLE}`}>
            Предстоящие записи
          </h3>
          <ul aria-label="Предстоящие записи" className="mt-3 space-y-2">
            {upcomingBookings.length === 0 && (
              <li className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                Пока нет записей
              </li>
            )}
            {upcomingBookings.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <span className="font-medium">{b.meetingTypeName}</span>
                <span className="text-sm text-slate-600 tabular-nums">
                  {fmtDate(b.slotStart.slice(0, 10))}
                </span>
                <span className="text-sm text-slate-600 tabular-nums">
                  {fmtTime(b.slotStart)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
