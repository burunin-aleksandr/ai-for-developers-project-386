import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import App, { monthLabel } from "./App";
import {
  fmtDate,
  fmtTime,
  plusDays,
  todayInDisplayZone,
  weekStartOf,
} from "./dates";
import {
  fetchClient,
  loadFixtures,
  startBookings,
} from "../../fixtures/startup-fixtures.mjs";
import type { AddressInfo } from "node:net";

const WINDOW_START_MINUTES = 9 * 60;
const WINDOW_END_MINUTES = 18 * 60;
const SLOT_STEP_MINUTES = 30;
const DISPLAY_UTC_OFFSET_HOURS = 3;

type FakeEvent = { id: number; start: string; end: string };
type FakeBooking = {
  id: number;
  slotStart: string;
  name: string;
  email: string;
  createdAt: string;
};

let server: Server;
let baseUrl: string;
let events: FakeEvent[];
let bookings: FakeBooking[];
let nextEventId: number;
let nextBookingId: number;

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function isGridSlot(slotStart: string): boolean {
  const start = new Date(slotStart);
  if (Number.isNaN(start.getTime())) return false;
  if (start.getTime() < Date.now()) return false;
  if (start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0) {
    return false;
  }
  const minutes =
    start.getUTCHours() * 60 +
    start.getUTCMinutes() +
    DISPLAY_UTC_OFFSET_HOURS * 60;
  const inDay = minutes % (24 * 60);
  return (
    inDay >= WINDOW_START_MINUTES &&
    inDay + SLOT_STEP_MINUTES <= WINDOW_END_MINUTES &&
    inDay % SLOT_STEP_MINUTES === 0
  );
}

function buildMonth(date: string) {
  const monthStart = `${date.slice(0, 7)}-01`;
  const d = new Date(`${monthStart}T00:00:00.000Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + i);
    const dateStr = day.toISOString().slice(0, 10);
    const slots: Array<{ start: string; end: string; status: string }> = [];

    for (
      let m = WINDOW_START_MINUTES;
      m < WINDOW_END_MINUTES;
      m += SLOT_STEP_MINUTES
    ) {
      const start = new Date(day);
      start.setUTCMinutes(m - DISPLAY_UTC_OFFSET_HOURS * 60, 0, 0);
      const end = new Date(start);
      end.setUTCMinutes(start.getUTCMinutes() + SLOT_STEP_MINUTES);
      if (start.getTime() < Date.now()) continue;

      const busy =
        events.some((e) =>
          overlaps(
            start.getTime(),
            end.getTime(),
            Date.parse(e.start),
            Date.parse(e.end),
          ),
        ) ||
        bookings.some((b) =>
          overlaps(
            start.getTime(),
            end.getTime(),
            Date.parse(b.slotStart),
            Date.parse(b.slotStart) + SLOT_STEP_MINUTES * 60_000,
          ),
        );

      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        status: busy ? "busy" : "free",
      });
    }

    return {
      date: dateStr,
      freeCount: slots.filter((s) => s.status === "free").length,
      slots,
    };
  });

  return { month: monthStart, days };
}

function json(res: import("node:http").ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

/** Поднимаем настоящий HTTP-сервер с фейковым API — страницы ходят в реальный шов. */
beforeEach(async () => {
  window.history.replaceState(null, "", "/");
  events = [];
  bookings = [];
  nextEventId = 1;
  nextBookingId = 1;

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/slots") {
      const date = url.searchParams.get("date") ?? "";
      return json(res, 200, buildMonth(date));
    }

    if (req.method === "GET" && url.pathname === "/admin-events") {
      return json(res, 200, { adminEvents: events });
    }

    if (req.method === "POST" && url.pathname === "/admin-events") {
      void readBody(req).then((raw) => {
        const body = JSON.parse(raw) as { start: string; end: string };
        const created = { id: nextEventId++, ...body };
        events.push(created);
        json(res, 201, created);
      });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/admin-events/")) {
      const id = Number(url.pathname.split("/")[2]);
      const before = events.length;
      events = events.filter((e) => e.id !== id);
      if (events.length === before) return json(res, 404, { message: "not found" });
      return json(res, 204, null);
    }

    if (req.method === "GET" && url.pathname === "/bookings") {
      const upcoming = bookings
        .filter((b) => Date.parse(b.slotStart) > Date.now())
        .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
      return json(res, 200, { bookings: upcoming });
    }

    if (req.method === "POST" && url.pathname === "/bookings") {
      void readBody(req).then((raw) => {
        const body = JSON.parse(raw) as {
          slotStart: string;
          name: string;
          email: string;
        };
        if (!body.name?.trim() || !body.email?.trim()) {
          return json(res, 400, { message: "Имя и email обязательны" });
        }
        if (!isGridSlot(body.slotStart)) {
          return json(res, 400, {
            message: "Слот не существует или уже в прошлом",
          });
        }
        const start = Date.parse(body.slotStart);
        const end = start + SLOT_STEP_MINUTES * 60_000;
        const busy =
          bookings.some((b) =>
            overlaps(
              start,
              end,
              Date.parse(b.slotStart),
              Date.parse(b.slotStart) + SLOT_STEP_MINUTES * 60_000,
            ),
          ) ||
          events.some((e) =>
            overlaps(start, end, Date.parse(e.start), Date.parse(e.end)),
          );
        if (busy) {
          return json(res, 409, {
            message: "Слот уже занят — выберите другой",
          });
        }
        const created: FakeBooking = {
          id: nextBookingId++,
          slotStart: body.slotStart,
          name: body.name.trim(),
          email: body.email.trim(),
          createdAt: new Date().toISOString(),
        };
        bookings.push(created);
        return json(res, 201, created);
      });
      return;
    }

    json(res, 404, { message: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  window.history.replaceState(null, "", "/");
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Открывает экран записи с лендинга. */
async function openBooking() {
  render(<App baseUrl={baseUrl} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Записаться →" }),
  );
  await screen.findByRole("heading", { name: "Запись на звонок" });
}

/** Выбирает первый день сетки, где есть свободные слоты. */
async function selectFirstFreeDay(): Promise<HTMLElement> {
  const cells = await screen.findAllByRole("button", {
    name: /Свободно: \d+/,
  });
  const day = cells.find((cell) =>
    /Свободно: [1-9]/.test(cell.textContent ?? ""),
  );
  if (!day) throw new Error("нет дня со свободными слотами");
  await userEvent.click(day);
  return day;
}

/** Выбирает первый свободный слот выбранного дня. */
async function selectFirstFreeSlot(): Promise<HTMLElement> {
  await selectFirstFreeDay();
  const list = await screen.findByRole("list", { name: "Слоты" });
  const free = within(list).getAllByRole("button", { name: /Свободно/ })[0];
  await userEvent.click(free);
  return free;
}

/** Первый свободный слот по данным сервера (для сценариев гонки). */
async function firstFreeSlotFromServer() {
  const res = await fetch(`${baseUrl}/slots?date=${todayInDisplayZone()}`);
  const data = (await res.json()) as {
    days: Array<{
      date: string;
      slots: Array<{ start: string; end: string; status: string }>;
    }>;
  };
  for (const day of data.days) {
    const slot = day.slots.find((s) => s.status === "free");
    if (slot) return { day: day.date, slot };
  }
  throw new Error("нет свободного слота");
}

describe("страницы: лендинг", () => {
  test("показывает новый заголовок, пункты и кнопку записи", async () => {
    render(<App baseUrl={baseUrl} />);

    expect(
      screen.getByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Что доступно прямо сейчас"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "• Фиксированные 30-минутные слоты с 09:00 до 18:00.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("• Проверка конфликта при бронировании."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "• Просмотр предстоящих событий в отдельном разделе.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Записаться →" }),
    ).toBeInTheDocument();
  });

  test("кнопка «Записаться →» открывает экран записи", async () => {
    await openBooking();
    expect(
      screen.getByRole("heading", { name: "Запись на звонок" }),
    ).toBeInTheDocument();
  });
});

describe("страницы: экран записи", () => {
  test("дата не выбрана: подсказка, нули и константа 30 мин", async () => {
    await openBooking();

    expect(
      screen.getByText("Выберите дату в календаре."),
    ).toBeInTheDocument();
    expect(screen.getByText("Дата не выбрана")).toBeInTheDocument();
    expect(screen.getByText("Время не выбрано")).toBeInTheDocument();
    expect(screen.getByText("Длительности в дне")).toBeInTheDocument();
    expect(screen.getByText("30 мин")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Слоты" })).toBeNull();
  });

  test("календарь: 42 дня, месяц не выбирается автоматически", async () => {
    await openBooking();

    const cells = await screen.findAllByRole("button", {
      name: /Свободно: \d+/,
    });
    expect(cells).toHaveLength(42);
    expect(
      screen.getByText(monthLabel(todayInDisplayZone())),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "←" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→" })).toBeInTheDocument();
    // ни один день не выбран
    expect(
      cells.every((cell) => cell.getAttribute("aria-pressed") !== "true"),
    ).toBe(true);
  });

  test("выбор дня показывает слоты диапазонами со статусами", async () => {
    await openBooking();
    await selectFirstFreeDay();

    const list = await screen.findByRole("list", { name: "Слоты" });
    expect(
      within(list).getAllByText(/^\d{2}:\d{2} - \d{2}:\d{2}$/).length,
    ).toBeGreaterThan(0);
    expect(within(list).getAllByText("Свободно").length).toBeGreaterThan(0);
    // день выбран — панель информации обновилась
    expect(screen.queryByText("Дата не выбрана")).toBeNull();
  });

  test("выбор слота заполняет «Выбранное время» и включает «Продолжить»", async () => {
    await openBooking();
    const free = await selectFirstFreeSlot();

    const range = free.textContent?.match(/\d{2}:\d{2} - \d{2}:\d{2}/)?.[0];
    expect(range).toBeDefined();

    const info = screen.getByRole("region", { name: "Выбранный слот" });
    expect(within(info).getByText(range!)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
  });

  test("«Продолжить» открывает подтверждение, календарь скрыт", async () => {
    await openBooking();
    await selectFirstFreeSlot();
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(
      await screen.findByRole("heading", { name: "Подтверждение записи" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Подтвердить запись" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Календарь" })).toBeNull();

    // «Изменить» возвращает к выбору слота, сохраняя выбор
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    expect(
      await screen.findByRole("heading", { name: "Календарь" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
  });

  test("имя и email обязательны — панель показывает ошибку", async () => {
    await openBooking();
    await selectFirstFreeSlot();
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Подтвердить запись" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Заполните имя и email",
    );
  });

  test("полный поток: слот → подтверждение → успех → чистая запись", async () => {
    await openBooking();
    await selectFirstFreeSlot();
    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await userEvent.type(await screen.findByLabelText("Имя"), "Иван Петров");
    await userEvent.type(screen.getByLabelText("Email"), "ivan@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Подтвердить запись" }),
    );

    expect(
      await screen.findByText("Бронь подтверждена. До встречи!"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Забронировать еще" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Забронировать еще" }),
    );
    expect(
      await screen.findByText("Выберите дату в календаре."),
    ).toBeInTheDocument();
    expect(screen.getByText("Дата не выбрана")).toBeInTheDocument();
    expect(screen.queryByText("Бронь подтверждена. До встречи!")).toBeNull();
  });

  test("«Назад» возвращает на лендинг", async () => {
    await openBooking();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(
      await screen.findByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();
  });

  test("слот заняли между выбором и отправкой — 409 и возврат к выбору", async () => {
    const { day, slot } = await firstFreeSlotFromServer();
    const range = `${fmtTime(slot.start)} - ${fmtTime(slot.end)}`;

    await openBooking();
    await userEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(escapeRe(fmtDate(day))),
      }),
    );
    const list = await screen.findByRole("list", { name: "Слоты" });
    await userEvent.click(
      within(list).getByRole("button", {
        name: new RegExp(escapeRe(range)),
      }),
    );

    // другой гость занимает слот, пока наш гость заполняет форму
    await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slotStart: slot.start,
        name: "Пётр",
        email: "petr@example.com",
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    await userEvent.type(await screen.findByLabelText("Имя"), "Иван");
    await userEvent.type(screen.getByLabelText("Email"), "ivan@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Подтвердить запись" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Слот уже занят/,
    );
    await waitFor(() => {
      const fresh = screen.getByRole("list", { name: "Слоты" });
      const busy = within(fresh).getByRole("button", {
        name: new RegExp(escapeRe(range)),
      });
      expect(busy).toBeDisabled();
      expect(busy).toHaveTextContent("Занято");
    });
  });
});

describe("страницы: события админа", () => {
  test("событие админа делает пересекающийся слот занятым, сетка остаётся", async () => {
    const { day, slot } = await firstFreeSlotFromServer();
    const range = `${fmtTime(slot.start)} - ${fmtTime(slot.end)}`;

    await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ start: slot.start, end: slot.end }),
    });

    await openBooking();
    await userEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(escapeRe(fmtDate(day))),
      }),
    );

    const list = await screen.findByRole("list", { name: "Слоты" });
    const busy = within(list).getByRole("button", {
      name: new RegExp(escapeRe(range)),
    });
    expect(busy).toBeDisabled();
    expect(busy).toHaveTextContent("Занято");
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(1);
  });

  test("#admin открывает управление событиями админа", async () => {
    window.location.hash = "#admin";
    render(<App baseUrl={baseUrl} />);

    expect(
      await screen.findByRole("heading", { name: "События админа" }),
    ).toBeInTheDocument();
    // типов встреч в интерфейсе больше нет
    expect(screen.queryByText("Типы встреч не созданы")).toBeNull();
    expect(screen.queryByText("Создать тип встречи")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Создать событие" }),
    );
    await userEvent.type(screen.getByLabelText("Начало"), "2026-11-10T10:00");
    await userEvent.type(screen.getByLabelText("Конец"), "2026-11-10T11:00");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("10:00 — 11:00")).toBeInTheDocument();
  });

  test("админ удаляет событие — список становится пустым", async () => {
    await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: "2026-11-10T06:00:00.000Z",
        end: "2026-11-10T07:00:00.000Z",
      }),
    });

    window.location.hash = "#admin";
    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Удалить" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("10:00 — 11:00")).toBeNull();
    });
  });
});

describe("страницы: предстоящие события", () => {
  test("показывает имя, email, слот и момент создания", async () => {
    const monday = plusDays(weekStartOf(todayInDisplayZone()), 14);
    const slotStart = `${monday}T06:00:00.000Z`;
    await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slotStart,
        name: "Иван Петров",
        email: "ivan@example.com",
      }),
    });

    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Предстоящие события" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Предстоящие события" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Список событий" });
    expect(within(list).getByText("Иван Петров")).toBeInTheDocument();
    expect(within(list).getByText("ivan@example.com")).toBeInTheDocument();
    expect(
      within(list).getByText(
        `Слот: ${fmtDate(monday)}, ${fmtTime(slotStart)}`,
      ),
    ).toBeInTheDocument();
    expect(
      within(list).getByText(/Создано: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/),
    ).toBeInTheDocument();
  });

  test("без записей показывает «Пока нет событий»", async () => {
    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Предстоящие события" }),
    );

    expect(await screen.findByText("Пока нет событий")).toBeInTheDocument();
  });
});

describe("страницы: фикстуры", () => {
  test("после загрузки фикстур страница событий показывает демо-записи", async () => {
    const counts = await loadFixtures(fetchClient(baseUrl));
    expect(counts.adminEvents).toBeGreaterThan(0);
    expect(counts.bookings).toBeGreaterThan(0);

    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Предстоящие события" }),
    );

    const list = await screen.findByRole("list", { name: "Список событий" });
    for (const booking of startBookings()) {
      expect(within(list).getByText(booking.name)).toBeInTheDocument();
      expect(within(list).getByText(booking.email)).toBeInTheDocument();
    }
  });
});
