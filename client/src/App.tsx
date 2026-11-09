import { useEffect, useState } from "react";
import type { components } from "./api/schema";
import {
  DISPLAY_UTC_OFFSET_HOURS,
  displayDateOf,
  fmtDate,
  fmtTime,
  plusMonths,
  todayInDisplayZone,
} from "./dates";

type MonthSlots = components["schemas"]["MonthSlots"];
type Slot = components["schemas"]["Slot"];
type AdminEvent = components["schemas"]["AdminEvent"];
type Booking = components["schemas"]["Booking"];

type View = "landing" | "booking" | "events" | "admin";
type BookingStep = "select" | "confirm" | "success";

const STATUS_LABELS: Record<Slot["status"], string> = {
  free: "Свободно",
  busy: "Занято",
};

/** Длительность фиксированного слота — константа (30 минут). */
const SLOT_DURATION_LABEL = "30 мин";

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
const PANEL = "flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

/** Русский месяц и год для заголовка календаря («ноябрь 2026 г.»). */
export function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const month = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  return `${month} ${d.getUTCFullYear()} г.`;
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

/** Диапазон слота в отображаемом поясе («09:00 - 09:30»). */
function slotRange(slot: Slot): string {
  return `${fmtTime(slot.start)} - ${fmtTime(slot.end)}`;
}

const NAV_ACTIVE =
  "rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition";
const NAV_IDLE =
  "rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:text-slate-900";

/** Лендинг: заголовок, копия и кнопка входа в сценарий записи. */
function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section aria-label="Лендинг" className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm bg-[linear-gradient(100deg,#dbeafe_0%,#ffffff_50%,#ffedd5_100%)]">
        <div className="grid gap-8 p-8 md:grid-cols-2 md:p-10">
          <div className="flex flex-col items-center justify-center gap-4 md:items-start">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-wide text-slate-600 shadow-sm">
              БЫСТРАЯ ЗАПИСЬ НА ЗВОНОК
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight">Calendar</h1>
            <p className="max-w-md text-slate-600">
              Один экран, понятные слоты, быстрая бронь. Выберите время и
              запишитесь на звонок без лишних шагов.
            </p>
            <button type="button" onClick={onStart} className={BTN_PRIMARY}>
              Записаться →
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">
              Что доступно прямо сейчас
            </h2>
            <ul className="space-y-3 text-sm text-slate-600">
              <li>• Фиксированные 30-минутные слоты с 09:00 до 18:00.</li>
              <li>• Проверка конфликта при бронировании.</li>
              <li>• Просмотр предстоящих событий в отдельном разделе.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Панель «Информация»: выбранные дата и время, свободные слоты, длительность. */
function InfoPanel({
  selectedDay,
  selectedSlot,
  freeCount,
}: {
  selectedDay: string | null;
  selectedSlot: Slot | null;
  freeCount: number;
}) {
  return (
    <section className={PANEL}>
      <h2 className="mb-4 text-lg font-bold">Информация</h2>
      <section aria-label="Выбранный слот" className="space-y-3">
        <div className={INFO_BOX}>
          <p className="text-sm text-slate-500">Выбранная дата</p>
          <p className="mt-0.5 font-semibold">
            {selectedDay ? ruDate(selectedDay) : "Дата не выбрана"}
          </p>
        </div>
        <div className={INFO_BOX}>
          <p className="text-sm text-slate-500">Выбранное время</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {selectedSlot ? slotRange(selectedSlot) : "Время не выбрано"}
          </p>
        </div>
        <div className={INFO_BOX}>
          <p className="text-sm text-slate-500">Свободно</p>
          <p className="mt-0.5 font-semibold tabular-nums">{freeCount}</p>
        </div>
        <div className={INFO_BOX}>
          <p className="text-sm text-slate-500">Длительности в дне</p>
          <p className="mt-0.5 font-semibold">{SLOT_DURATION_LABEL}</p>
        </div>
      </section>
    </section>
  );
}

/** Панель «Календарь»: сетка 6×7 пн–вс, листание по месяцам. */
function CalendarPanel({
  monthGrid,
  monthDate,
  selectedDay,
  onShiftMonth,
  onSelectDay,
}: {
  monthGrid: MonthSlots | null;
  monthDate: string;
  selectedDay: string | null;
  onShiftMonth: (delta: number) => void;
  onSelectDay: (date: string) => void;
}) {
  return (
    <section className={PANEL}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Календарь</h2>
        <nav aria-label="Месяц" className="flex gap-2">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            →
          </button>
        </nav>
      </div>
      <p className="text-sm font-semibold text-slate-700">
        {monthGrid ? monthLabel(monthGrid.month) : "Загрузка…"}
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
      {monthGrid && (
        <ul aria-label="Дни месяца" className="grid grid-cols-7 gap-1.5">
          {monthGrid.days.map((day) => {
            const isSelected = selectedDay === day.date;
            const inMonth =
              day.date.slice(0, 7) === monthGrid.month.slice(0, 7);
            return (
              <li key={day.date}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectDay(day.date)}
                  className={`flex h-full min-h-[50px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
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
                  {day.freeCount > 0 && (
                    <span className="whitespace-nowrap text-[10px] leading-none text-slate-400">
                      {day.freeCount} св.
                    </span>
                  )}
                  <span className="sr-only">{fmtDate(day.date)}</span>
                  <span className="sr-only">Свободно: {day.freeCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* monthDate нужен как ключ перерисовки сетки при листании */}
      <span className="sr-only">{monthDate}</span>
    </section>
  );
}

/** Панель «Статус слотов»: список слотов выбранного дня и переход к подтверждению. */
function SlotsPanel({
  selectedDay,
  daySlots,
  selectedSlot,
  error,
  onSelectSlot,
  onBack,
  onContinue,
}: {
  selectedDay: string | null;
  daySlots: MonthSlots["days"][number] | undefined;
  selectedSlot: Slot | null;
  error: string | null;
  onSelectSlot: (slot: Slot) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <section className={PANEL}>
      <h2 className="mb-4 text-lg font-bold">Статус слотов</h2>
      {!selectedDay ? (
        <p className="text-sm text-slate-500">Выберите дату в календаре.</p>
      ) : daySlots && daySlots.slots.length === 0 ? (
        <p className="text-sm text-slate-500">Нет слотов на этот день</p>
      ) : (
        <ul aria-label="Слоты" className="space-y-2">
          {daySlots?.slots.map((slot) => (
            <li key={slot.start}>
              <button
                type="button"
                disabled={slot.status === "busy"}
                aria-pressed={selectedSlot?.start === slot.start}
                onClick={() => onSelectSlot(slot)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  slot.status === "busy"
                    ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-500"
                    : selectedSlot?.start === slot.start
                      ? "border-orange-500 bg-orange-50"
                      : "border-slate-200 bg-white hover:border-orange-300"
                }`}
              >
                <span className="font-medium tabular-nums">
                  {slotRange(slot)}
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

      {error && (
        <p role="alert" className={`mt-4 ${ALERT_ERROR}`}>
          {error}
        </p>
      )}

      <div className="mt-auto flex gap-3 pt-4">
        <button type="button" onClick={onBack} className={`flex-1 ${BTN_SECONDARY}`}>
          Назад
        </button>
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={onContinue}
          className={`flex-1 ${BTN_PRIMARY}`}
        >
          Продолжить
        </button>
      </div>
    </section>
  );
}

/** Панель «Подтверждение записи»: имя и email, возврат к выбору слота. */
function ConfirmPanel({
  name,
  email,
  error,
  onChangeName,
  onChangeEmail,
  onEdit,
  onSubmit,
}: {
  name: string;
  email: string;
  error: string | null;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  return (
    <section aria-label="Подтверждение записи" className={PANEL}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Подтверждение записи</h2>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-medium text-orange-600 transition hover:text-orange-700"
        >
          Изменить
        </button>
      </div>
      <form
        aria-label="Форма записи"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <label className={LABEL}>
          Имя
          <input
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => onChangeEmail(e.target.value)}
            className={INPUT}
          />
        </label>
        <button type="submit" className={`w-full ${BTN_PRIMARY}`}>
          Подтвердить запись
        </button>
        {error && (
          <p role="alert" className={ALERT_ERROR}>
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

/** Панель успеха: бронь подтверждена, возврат к чистой записи. */
function SuccessPanel({ onReset }: { onReset: () => void }) {
  return (
    <section
      aria-label="Успех"
      className={`${PANEL} items-center justify-center text-center`}
    >
      <p className="text-2xl font-bold text-orange-600">
        Бронь подтверждена. До встречи!
      </p>
      <button type="button" onClick={onReset} className={`mt-5 ${BTN_PRIMARY}`}>
        Забронировать еще
      </button>
    </section>
  );
}

/** Публичная страница «Предстоящие события». */
function EventsPage({ bookings }: { bookings: Booking[] }) {
  return (
    <section aria-label="Предстоящие события" className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">
        Предстоящие события
      </h1>
      {bookings.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          Пока нет событий
        </p>
      ) : (
        <ul aria-label="Список событий" className="space-y-3">
          {bookings.map((booking) => (
            <li key={booking.id} className={CARD}>
              <p className="font-semibold">{booking.name}</p>
              <p className="text-sm text-slate-500">{booking.email}</p>
              <p className="mt-2 text-sm tabular-nums text-slate-700">
                Слот: {fmtDate(displayDateOf(booking.slotStart))},{" "}
                {fmtTime(booking.slotStart)}
              </p>
              <p className="text-sm tabular-nums text-slate-500">
                Создано: {fmtDate(displayDateOf(booking.createdAt))},{" "}
                {fmtTime(booking.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function App({ baseUrl = "" }: { baseUrl?: string }) {
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.location.hash === "#admin"
      ? "admin"
      : "landing",
  );

  const [monthDate, setMonthDate] = useState<string>(todayInDisplayZone);
  const [monthGrid, setMonthGrid] = useState<MonthSlots | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<BookingStep>("select");
  const [form, setForm] = useState({ name: "", email: "" });
  const [bookingError, setBookingError] = useState<string | null>(null);
  // бамп при изменении занятости — чтобы календарь гостя перезапросился
  const [slotsRevision, setSlotsRevision] = useState(0);

  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);
  const [eventForm, setEventForm] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [eventError, setEventError] = useState<string | null>(null);

  const [upcoming, setUpcoming] = useState<Booking[]>([]);

  // непубличный hash-маршрут админки: #admin
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#admin") setView("admin");
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
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

  // публичная страница «Предстоящие события» загружает записи при открытии
  useEffect(() => {
    if (view !== "events") return;
    let cancelled = false;
    void fetch(`${baseUrl}/bookings`)
      .then((res) => res.json())
      .then((data: { bookings: Booking[] }) => {
        if (!cancelled) setUpcoming(data.bookings);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [view, baseUrl]);

  // слоты месяца считаются на лету; день не выбирается автоматически
  useEffect(() => {
    if (view !== "booking") return;
    let cancelled = false;
    fetch(`${baseUrl}/slots?date=${monthDate}`)
      .then((res) => res.json())
      .then((data: MonthSlots) => {
        if (!cancelled) setMonthGrid(data);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [view, monthDate, slotsRevision, baseUrl]);

  async function loadEvents(): Promise<AdminEvent[]> {
    const res = await fetch(`${baseUrl}/admin-events`);
    const data = (await res.json()) as { adminEvents: AdminEvent[] };
    return data.adminEvents;
  }

  function navigate(next: View) {
    if (next !== "admin" && window.location.hash === "#admin") {
      window.location.hash = "";
    }
    setView(next);
  }

  /** Вход в сценарий записи: чистое состояние, текущий месяц, день не выбран. */
  function startBooking() {
    setMonthDate(todayInDisplayZone());
    setSelectedDay(null);
    setSelectedSlot(null);
    setStep("select");
    setForm({ name: "", email: "" });
    setBookingError(null);
    navigate("booking");
  }

  /** Сброс после успешной брони: возврат к чистому экрану записи. */
  function resetBooking() {
    setMonthDate(todayInDisplayZone());
    setSelectedDay(null);
    setSelectedSlot(null);
    setStep("select");
    setForm({ name: "", email: "" });
    setBookingError(null);
    setSlotsRevision((v) => v + 1);
  }

  /** Листание по месяцам: выбранные день и слот сбрасываются. */
  function shiftMonth(delta: number) {
    setMonthDate((d) => plusMonths(d, delta));
    setSelectedDay(null);
    setSelectedSlot(null);
    setBookingError(null);
    setStep("select");
  }

  function selectDay(date: string) {
    if (date !== selectedDay) {
      setSelectedDay(date);
      // слот прежнего дня не должен пережить смену дня
      setSelectedSlot(null);
    }
    const inMonth =
      monthGrid && date.slice(0, 7) === monthGrid.month.slice(0, 7);
    // клик по дню соседнего месяца переключает вид
    if (!inMonth) setMonthDate(date);
  }

  function selectSlot(slot: Slot) {
    setSelectedSlot(slot);
    setBookingError(null);
    setStep("select");
  }

  async function submitBooking() {
    if (!selectedSlot) return;
    if (!form.name.trim() || !form.email.trim()) {
      setBookingError("Заполните имя и email");
      return;
    }

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slotStart: selectedSlot.start,
        name: form.name,
        email: form.email,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      // конфликт занятости: возвращаем гостя к выбору слота с сообщением
      if (res.status === 409) {
        setBookingError(body?.message ?? "Слот уже занят — выберите другой");
        setStep("select");
        setSelectedSlot(null);
        setSlotsRevision((v) => v + 1); // перерисовать сетку: слот теперь занят
        return;
      }
      setBookingError(body?.message ?? `Ошибка записи (${res.status})`);
      return;
    }

    setBookingError(null);
    setStep("success");
    setSlotsRevision((v) => v + 1);
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

  const daySlots = selectedDay
    ? monthGrid?.days.find((d) => d.date === selectedDay)
    : undefined;
  const freeCount = daySlots?.freeCount ?? 0;
  const isConfirm = step === "confirm";
  const isSuccess = step === "success";
  const bookingColumns = isConfirm || isSuccess ? "lg:grid-cols-2" : "lg:grid-cols-3";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <button
            type="button"
            onClick={() => navigate("landing")}
            className="flex items-center gap-2"
          >
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
          </button>
          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={startBooking}
              aria-current={
                view === "landing" || view === "booking" ? "page" : undefined
              }
              className={
                view === "landing" || view === "booking" ? NAV_ACTIVE : NAV_IDLE
              }
            >
              Записаться
            </button>
            <button
              type="button"
              onClick={() => navigate("events")}
              aria-current={view === "events" ? "page" : undefined}
              className={view === "events" ? NAV_ACTIVE : NAV_IDLE}
            >
              Предстоящие события
            </button>
          </nav>
        </div>
      </header>

      {view === "landing" && <Landing onStart={startBooking} />}

      {view === "booking" && (
        <section aria-label="Запись на звонок" className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">
            Запись на звонок
          </h1>
          <div className={`grid gap-5 ${bookingColumns}`}>
            <InfoPanel
              selectedDay={selectedDay}
              selectedSlot={selectedSlot}
              freeCount={freeCount}
            />

            {!isConfirm && !isSuccess && (
              <CalendarPanel
                monthGrid={monthGrid}
                monthDate={monthDate}
                selectedDay={selectedDay}
                onShiftMonth={shiftMonth}
                onSelectDay={selectDay}
              />
            )}

            {isSuccess ? (
              <SuccessPanel onReset={resetBooking} />
            ) : isConfirm ? (
              <ConfirmPanel
                name={form.name}
                email={form.email}
                error={bookingError}
                onChangeName={(value) =>
                  setForm((f) => ({ ...f, name: value }))
                }
                onChangeEmail={(value) =>
                  setForm((f) => ({ ...f, email: value }))
                }
                onEdit={() => {
                  setBookingError(null);
                  setStep("select");
                }}
                onSubmit={() => void submitBooking()}
              />
            ) : (
              <SlotsPanel
                selectedDay={selectedDay}
                daySlots={daySlots}
                selectedSlot={selectedSlot}
                error={bookingError}
                onSelectSlot={selectSlot}
                onBack={() => navigate("landing")}
                onContinue={() => {
                  setBookingError(null);
                  setStep("confirm");
                }}
              />
            )}
          </div>
        </section>
      )}

      {view === "events" && <EventsPage bookings={upcoming} />}

      {view === "admin" && (
        <section aria-label="Админка" className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">
            События админа
          </h1>
          <button
            type="button"
            onClick={() => {
              setEventForm({ start: "", end: "" });
              setEventError(null);
            }}
            className={BTN_PRIMARY}
          >
            Создать событие
          </button>

          <ul className="mt-4 space-y-2">
            {adminEvents.map((event) => (
              <li key={event.id} className={ROW}>
                <span className="text-sm font-medium tabular-nums">
                  {fmtTime(event.start)} — {fmtTime(event.end)}
                </span>
                <button
                  type="button"
                  onClick={() => void deleteEvent(event.id)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>

          {eventForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveEvent();
              }}
              className={`mt-4 ${CARD} space-y-4`}
            >
              <h2 className={SECTION_TITLE}>Новое событие</h2>
              <label className={LABEL}>
                Начало
                <input
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(e) =>
                    setEventForm((f) =>
                      f ? { ...f, start: e.target.value } : f,
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
                  onChange={(e) =>
                    setEventForm((f) => (f ? { ...f, end: e.target.value } : f))
                  }
                  className={INPUT}
                />
              </label>
              <button type="submit" className={BTN_PRIMARY}>
                Сохранить
              </button>
              {eventError && (
                <p role="alert" className={ALERT_ERROR}>
                  {eventError}
                </p>
              )}
            </form>
          )}
        </section>
      )}
    </main>
  );
}
