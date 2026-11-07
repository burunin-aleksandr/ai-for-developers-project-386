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
  "rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_SECONDARY =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";
const INPUT =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none";
const LABEL = "block text-sm font-medium";
const CARD =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const ROW =
  "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm";
const ALERT_ERROR = "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700";
const SECTION_TITLE = "text-lg font-semibold text-slate-900";
const INFO_BOX = "rounded-xl bg-slate-100 px-4 py-3";

/** Русский месяц и год для заголовка календаря («ноябрь 2026 г.»). */
function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const month = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return `${month} ${d.getUTCFullYear()} г.`;
}

const NAV_ACTIVE =
  "rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition";
const NAV_IDLE =
  "rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:text-slate-900";

/** Аватар и имя хоста (макет docs/idea; имя по GLOSSARY — «admin»). */
function HostBadge({ size = "lg" }: { size?: "lg" | "sm" }) {
  const box =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-3xl"
      : "h-11 w-11 rounded-xl text-xl";
  const name = size === "lg" ? "font-bold" : "text-sm font-bold";
  const role = size === "lg" ? "text-sm text-slate-500" : "text-xs text-slate-500";
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex items-center justify-center bg-[linear-gradient(135deg,#fed7aa,#99f6e4)] ${box}`}
      >
        🥚
      </span>
      <div>
        <p className={name}>admin</p>
        <p className={role}>Хост</p>
      </div>
    </div>
  );
}

/** Русская локальная дата для панели «Информация» («суббота, 28 ноября»). */
function ruDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

/** Плавная прокрутка к списку типов по кнопке «Записаться →» на лендинге. */
function scrollToTypes() {
  document
    .getElementById("types")
    ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

/** Баннер лендинга (макет docs/idea): пилюля, заголовок, карточка «Возможности». */
function Hero() {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm bg-[linear-gradient(100deg,#dbeafe_0%,#ffffff_50%,#ffedd5_100%)]">
      <div className="grid gap-8 p-8 md:grid-cols-2 md:p-10">
        <div className="flex flex-col items-center justify-center gap-4 md:items-start">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 shadow-sm">
            БЫСТРАЯ ЗАПИСЬ НА ЗВОНОК
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight">Calendar</h1>
          <p className="max-w-md text-slate-600">
            Забронируйте встречу за минуту: выберите тип события и удобное
            время.
          </p>
          <button type="button" onClick={scrollToTypes} className={BTN_PRIMARY}>
            Записаться →
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">Возможности</h2>
          <ul className="space-y-3 text-sm text-slate-600">
            <li>• Выбор типа события и удобного времени для встречи.</li>
            <li>
              • Быстрое бронирование с подтверждением и дополнительными
              заметками.
            </li>
            <li>
              • Управление типами встреч и просмотр предстоящих записей в
              админке.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <span className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6 text-orange-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="text-base font-bold tracking-tight">Calendar</span>
          </span>
          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("booking")}
              aria-current={view === "booking" ? "page" : undefined}
              className={view === "booking" ? NAV_ACTIVE : NAV_IDLE}
            >
              Записаться
            </button>
            <button
              type="button"
              onClick={() => setView("admin")}
              aria-current={view === "admin" ? "page" : undefined}
              className={view === "admin" ? NAV_ACTIVE : NAV_IDLE}
            >
              Админка
            </button>
          </nav>
        </div>
      </header>

      {view === "booking" ? (
        <section aria-label="Записаться" className="mx-auto max-w-6xl px-6 py-8">
          {/* баннер лендинга — пока тип не выбран (макет docs/idea) */}
          {!selectedType && <Hero />}
          {meetingTypes.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Типы встреч не созданы
            </p>
          ) : !selectedType ? (
            <>
              <div
                id="types"
                className="mb-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
              >
                <div className="mb-6">
                  <HostBadge />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">
                  Выберите тип события
                </h2>
                <p className="mt-2 text-slate-500">
                  Нажмите на карточку, чтобы открыть календарь и выбрать
                  удобный слот.
                </p>
              </div>
              <ul className="grid gap-5 sm:grid-cols-2">
                {meetingTypes.map((t) => (
                  <li
                    key={t.id}
                    className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-300 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold">{t.name}</h3>
                      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {t.durationMinutes} мин
                      </span>
                    </div>
                    {t.description && (
                      <p className="mt-2 text-sm text-slate-500">
                        {t.description}
                      </p>
                    )}
                    {/* весь клик по карточке — доступное имя «Выбрать» сохраняется */}
                    <button
                      type="button"
                      onClick={() => setSelectedType(t)}
                      className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                    >
                      <span className="sr-only">Выбрать</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : selectedSlot && bookingStep === "form" ? (
            <div className="mx-auto max-w-lg">
              <form
                aria-label="Форма записи"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitBooking();
                }}
                className={`${CARD} space-y-4`}
              >
                <div>
                  <h1 className="text-2xl font-bold">{selectedType.name}</h1>
                  <p className="mt-1 text-sm tabular-nums text-slate-500">
                    {fmtDate(selectedSlot.start.slice(0, 10))} ·{" "}
                    {fmtTime(selectedSlot.start)} - {fmtTime(selectedSlot.end)}
                  </p>
                </div>
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
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingStep("idle")}
                    className={`flex-1 ${BTN_SECONDARY}`}
                  >
                    Назад
                  </button>
                  <button type="submit" className={`flex-1 ${BTN_PRIMARY}`}>
                    Записаться
                  </button>
                </div>
                {bookingError && (
                  <p role="alert" className={ALERT_ERROR}>
                    {bookingError}
                  </p>
                )}
              </form>
            </div>
          ) : selectedSlot && bookingStep === "success" ? (
            <div className="mx-auto max-w-lg">
              <section aria-label="Успех" className={`${CARD} text-center`}>
                <p className="text-2xl font-bold text-orange-600">
                  Вы записаны
                </p>
                <dl className="mt-4 space-y-1 text-sm text-slate-700">
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
                      {fmtTime(selectedSlot.start)} - {fmtTime(selectedSlot.end)}
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
                <button
                  type="button"
                  onClick={resetBooking}
                  className={`mt-5 ${BTN_PRIMARY}`}
                >
                  К календарю
                </button>
              </section>
            </div>
          ) : (
            <div>
              <h1 className="mb-6 text-3xl font-bold tracking-tight">
                {selectedType.name}
              </h1>
              <div className="grid gap-5 lg:grid-cols-3">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-bold">Информация</h2>
                  <div className="mb-4">
                    <HostBadge size="sm" />
                  </div>
                  <p className="font-bold">{selectedType.name}</p>
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {selectedType.durationMinutes} мин
                  </span>
                  {selectedType.description && (
                    <p className="mt-2 text-sm text-slate-500">
                      {selectedType.description}
                    </p>
                  )}
                  <section
                    aria-label="Выбранный слот"
                    className="mt-4 space-y-3"
                  >
                    <div className={INFO_BOX}>
                      <p className="text-sm text-slate-500">Выбранная дата</p>
                      <p className="mt-0.5 font-semibold">
                        {selectedDay
                          ? ruDate(selectedDay)
                          : "Дата не выбрана"}
                      </p>
                    </div>
                    <div className={INFO_BOX}>
                      <p className="text-sm text-slate-500">Выбранное время</p>
                      <p className="mt-0.5 font-semibold tabular-nums">
                        {selectedSlot
                          ? `${fmtTime(selectedSlot.start)} - ${fmtTime(selectedSlot.end)}`
                          : "Время не выбрано"}
                      </p>
                    </div>
                    <div className={INFO_BOX}>
                      <p className="text-sm text-slate-500">Свободно</p>
                      <p className="mt-0.5 font-semibold tabular-nums">
                        {week?.days.find((d) => d.date === selectedDay)
                          ?.freeCount ?? 0}
                      </p>
                    </div>
                    <div className={INFO_BOX}>
                      {/* подпись как на макете docs/idea */}
                      <p className="text-sm text-slate-500">
                        Длительности в день
                      </p>
                      <p className="mt-0.5 font-semibold">
                        {selectedType.durationMinutes} мин
                      </p>
                    </div>
                  </section>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Календарь</h2>
                    <nav aria-label="Неделя" className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWeekDate((d) => plusDays(d, -7))}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeekDate((d) => plusDays(d, 7))}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                      >
                        →
                      </button>
                    </nav>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {week ? monthLabel(week.weekStart) : "Загрузка…"}
                  </p>
                  {/* метка недели — контракт тестов (точный формат) */}
                  <p className="text-xs tabular-nums text-slate-500">
                    {week
                      ? `${fmtDate(week.weekStart)} — ${fmtDate(
                          plusDays(week.weekStart, 6),
                        )}`
                      : "Загрузка…"}
                  </p>
                  <div className="mb-2 mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">
                    <span>Пн</span>
                    <span>Вт</span>
                    <span>Ср</span>
                    <span>Чт</span>
                    <span>Пт</span>
                    <span>Сб</span>
                    <span>Вс</span>
                  </div>
                  {week && (
                    <ul
                      aria-label="Дни недели"
                      className="grid grid-cols-7 gap-1.5"
                    >
                      {week.days.map((day) => {
                        const isSelected = selectedDay === day.date;
                        const inMonth =
                          day.date.slice(0, 7) === week.weekStart.slice(0, 7);
                        return (
                          <li key={day.date}>
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedDay(day.date)}
                              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                                isSelected
                                  ? "border-orange-500 bg-orange-50"
                                  : "border-slate-100 bg-slate-50 hover:border-orange-300"
                              }`}
                            >
                              <span
                                className={`text-sm font-semibold tabular-nums ${
                                  inMonth ? "text-slate-700" : "text-slate-300"
                                }`}
                              >
                                {Number(day.date.slice(8, 10))}
                              </span>
                              {inMonth && day.freeCount > 0 && (
                                <span className="whitespace-nowrap text-[10px] leading-none text-slate-400">
                                  {day.freeCount} св.
                                </span>
                              )}
                              <span className="sr-only">
                                {fmtDate(day.date)}
                              </span>
                              <span className="sr-only">
                                Свободно: {day.freeCount}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-lg font-bold">Статус слотов</h2>
                  {week && selectedDay && (
                    // время слота — только начало: контракт тестов (точный текст
                    // «10:00»), на макете docs/idea показан диапазон
                    <ul aria-label="Слоты" className="space-y-2">
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
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                                slot.status === "busy"
                                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-500"
                                  : selectedSlot?.start === slot.start
                                    ? "border-orange-500 bg-orange-50"
                                    : "border-slate-200 bg-white hover:border-orange-300"
                              }`}
                            >
                              <span className="font-medium tabular-nums">
                                {fmtTime(slot.start)}
                              </span>
                              <span
                                className={`text-xs font-semibold ${
                                  slot.status === "busy"
                                    ? "text-slate-500"
                                    : "text-slate-900"
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
                    <p role="alert" className={`mt-4 ${ALERT_ERROR}`}>
                      {bookingError}
                    </p>
                  )}

                  <div className="mt-auto flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        resetBooking();
                        setSelectedType(null);
                      }}
                      className={`flex-1 ${BTN_SECONDARY}`}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      disabled={!selectedSlot}
                      onClick={() => setBookingStep("form")}
                      className={`flex-1 ${BTN_PRIMARY}`}
                    >
                      Продолжить
                    </button>
                  </div>
                </section>
              </div>
            </div>
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
