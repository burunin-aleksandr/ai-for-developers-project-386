import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import App from "./App";
import { fmtDate, plusDays, todayInDisplayZone, weekStartOf } from "./dates";
import type { AddressInfo } from "node:net";

let server: Server;
let baseUrl: string;

/** Поднимаем настоящий HTTP-сервер с фейковым API — страницы ходят в реальный шов. */
beforeEach(async () => {
  let types: Array<{
    id: number;
    name: string;
    description?: string;
    durationMinutes: number;
  }> = [];
  let nextId = 1;
  let events: Array<{
    id: number;
    start: string;
    end: string;
  }> = [];
  let nextEventId = 1;
  let bookings: Array<{
    id: number;
    slotStart: string;
    durationMinutes: number;
    name: string;
    email: string;
    comment?: string;
  }> = [];
  let nextBookingId = 1;

  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && url.pathname === "/slots") {
      const date = url.searchParams.get("date") ?? "";
      const d = new Date(`${date}T00:00:00.000Z`);
      const offset = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - offset);
      const duration = Number(url.searchParams.get("durationMinutes") ?? 15);
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d);
        day.setUTCDate(d.getUTCDate() + i);
        const dateStr = day.toISOString().slice(0, 10);
        let slots: Array<{ start: string; end: string; status: string }>;
        if (events.length > 0) {
          // слоты только из событий админа, нарезка с шагом durationMinutes
          slots = events
            .filter((e) => e.start.slice(0, 10) === dateStr)
            .flatMap((e) => {
              const out = [];
              for (
                let t = Date.parse(e.start);
                t + duration * 60_000 <= Date.parse(e.end);
                t += duration * 60_000
              ) {
                out.push({
                  start: new Date(t).toISOString(),
                  end: new Date(t + duration * 60_000).toISOString(),
                  status: "free",
                });
              }
              return out;
            });
        } else {
          // дефолтная сетка: первый слот сдвигается на час с индексом дня
          const hour = String(7 + i).padStart(2, "0");
          slots = [0, 1, 2].map((j) => ({
            start: `${dateStr}T${hour}:${String(j * 15).padStart(2, "0")}:00.000Z`,
            end: `${dateStr}T${hour}:${String(j * 15 + 15).padStart(2, "0")}:00.000Z`,
            status: i === 0 && j === 0 ? "busy" : "free",
          }));
        }
        // забронированные интервалы «Занято» для всех гостей (по пересечению)
        const busy = bookings.map((b) => {
          const s = Date.parse(b.slotStart);
          return { start: s, end: s + b.durationMinutes * 60_000 };
        });
        slots = slots.map((s) =>
          busy.some(
            (b) =>
              Date.parse(s.start) < b.end && b.start < Date.parse(s.end),
          )
            ? { ...s, status: "busy" }
            : s,
        );
        return {
          date: dateStr,
          freeCount: slots.filter((s) => s.status === "free").length,
          slots,
        };
      });
      return send(200, { weekStart: days[0].date, days });
    }
    if (req.method === "GET" && url.pathname === "/admin-events") {
      return send(200, { adminEvents: events });
    }
    if (req.method === "POST" && url.pathname === "/bookings") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw);
        if (!body.name?.trim() || !body.email?.trim()) {
          return send(400, { message: "Имя и email обязательны" });
        }
        // антидубль: пересечение интервалов → 409
        const start = Date.parse(body.slotStart);
        const end = start + (body.durationMinutes ?? 15) * 60_000;
        const overlap = bookings.some((b) => {
          const bStart = Date.parse(b.slotStart);
          const bEnd = bStart + b.durationMinutes * 60_000;
          return start < bEnd && bStart < end;
        });
        if (overlap) {
          return send(409, {
            message: "Слот уже занят — выберите другой",
          });
        }
        const created = { id: nextBookingId++, ...body };
        bookings.push(created);
        // контракт Booking не включает durationMinutes — отдаём только поля модели
        send(201, {
          id: created.id,
          slotStart: created.slotStart,
          name: created.name,
          email: created.email,
          ...(created.comment ? { comment: created.comment } : {}),
        });
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/admin-events") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw);
        const created = { id: nextEventId++, ...body };
        events.push(created);
        send(201, created);
      });
      return;
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/admin-events/")) {
      const id = Number(url.pathname.split("/")[2]);
      const before = events.length;
      events = events.filter((e) => e.id !== id);
      if (events.length === before) return send(404, { message: "not found" });
      return send(204, null);
    }
    if (req.method === "GET" && url.pathname === "/meeting-types") {
      return send(200, { meetingTypes: types });
    }
    if (req.method === "POST" && url.pathname === "/meeting-types") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw);
        const created = { id: nextId++, ...body };
        types.push(created);
        send(201, created);
      });
      return;
    }
    if (req.method === "PUT" && url.pathname.startsWith("/meeting-types/")) {
      const id = Number(url.pathname.split("/")[2]);
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw);
        types = types.map((t) => (t.id === id ? { ...t, ...body } : t));
        send(200, types.find((t) => t.id === id));
      });
      return;
    }
    send(404, { message: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

import { afterEach } from "vitest";
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("страницы: типы встреч", () => {
  test("гость видит карточки типов на лендинге", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Встреча 15 минут",
        description: "Короткий тип.",
        durationMinutes: 15,
      }),
    });

    render(<App baseUrl={baseUrl} />);

    expect(
      await screen.findByRole("heading", { name: "Встреча 15 минут" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Короткий тип.")).toBeInTheDocument();
    expect(screen.getByText("15 мин")).toBeInTheDocument();
  });

  test("пустой список — заглушка «Типы встреч не созданы»", async () => {
    render(<App baseUrl={baseUrl} />);

    expect(
      await screen.findByText("Типы встреч не созданы"),
    ).toBeInTheDocument();
  });

  test("админ создаёт тип встречи через форму", async () => {
    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Создать тип встречи" }),
    );
    await userEvent.type(
      screen.getByLabelText("Название"),
      "Встреча 30 минут",
    );
    await userEvent.selectOptions(screen.getByLabelText("Длительность"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      await screen.findByRole("heading", { name: "Встреча 30 минут" }),
    ).toBeInTheDocument();
  });

  test("админ редактирует существующий тип", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Было", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Редактировать" }),
    );
    const nameField = screen.getByLabelText("Название");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Стало");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Стало" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Было")).not.toBeInTheDocument();
    });
  });

  test("в админке нет операции удаления", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Тип", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await screen.findByRole("button", { name: "Редактировать" });

    expect(screen.queryByRole("button", { name: "Удалить" })).toBeNull();
  });
});

/** Понедельник текущей недели — как его вычисляет приложение (UTC+3). */
function mondayOfToday(): string {
  return weekStartOf(todayInDisplayZone());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("страницы: недельный календарь", () => {
  test("выбор типа встречи открывает недельный календарь", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча 15 минут", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );

    expect(
      (await screen.findAllByRole("button", { name: /Свободно: 3/ })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "←" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "→" })).toBeInTheDocument();
  });

  test("стрелки листают неделю вперёд и назад", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );
    await screen.findAllByRole("button", { name: /Свободно: \d+/ });

    await userEvent.click(screen.getByRole("button", { name: "→" }));
    expect(
      await screen.findByRole("button", {
        name: new RegExp(escapeRe(fmtDate(plusDays(mondayOfToday(), 7)))),
      }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "←" }));
    expect(
      await screen.findByRole("button", {
        name: new RegExp(escapeRe(fmtDate(mondayOfToday()))),
      }),
    ).toBeInTheDocument();
  });

  test("слоты показываются со статусами «Свободно» и «Занято»", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );

    expect(await screen.findAllByText("Свободно")).not.toHaveLength(0);
    expect(await screen.findAllByText("Занято")).not.toHaveLength(0);
  });

  test("слоты дня видны после выбора ячейки дня", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );
    // по умолчанию открыт понедельник (слоты в 10:00 UTC+3)
    expect(await screen.findByText("10:00")).toBeInTheDocument();

    // фейковый сервер сдвигает час слота по индексу дня: вторник = 11:00
    const tuesday = fmtDate(plusDays(mondayOfToday(), 1));
    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(escapeRe(tuesday)) }),
    );

    expect(await screen.findByText("11:00")).toBeInTheDocument();
    expect(screen.queryByText("10:00")).toBeNull();
  });
});

describe("страницы: события админа", () => {
  test("админ создаёт событие и видит его в списке", async () => {
    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Создать событие" }),
    );
    await userEvent.type(screen.getByLabelText("Начало"), "2026-11-10T10:00");
    await userEvent.type(screen.getByLabelText("Конец"), "2026-11-10T11:00");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      await screen.findByText("10:00 — 11:00"),
    ).toBeInTheDocument();
  });

  test("админ удаляет событие — список становится пустым", async () => {
    await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: "2026-11-10T07:00:00.000Z",
        end: "2026-11-10T08:00:00.000Z",
      }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Удалить" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("10:00 — 11:00")).toBeNull();
    });
  });

  test("гость видит только слоты из событий админа", async () => {
    // событие во вторник текущей недели: 07:00–08:00 UTC = 10:00–11:00 UTC+3
    const tuesday = plusDays(weekStartOf(todayInDisplayZone()), 1);
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 30 }),
    });
    await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: `${tuesday}T07:00:00.000Z`,
        end: `${tuesday}T08:00:00.000Z`,
      }),
    });

    render(<App baseUrl={baseUrl} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );

    // событие 10:00–11:00 UTC+3, нарезка 30 минут → 10:00 и 10:30
    expect(await screen.findByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
    expect(screen.queryByText("10:15")).toBeNull(); // дефолтная сетка не строится
    expect(screen.queryByText("11:00")).toBeNull(); // за пределами события
  });

  test("после удаления всех событий гость снова видит дефолтную сетку", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 30 }),
    });
    const tuesday = plusDays(weekStartOf(todayInDisplayZone()), 1);
    await fetch(`${baseUrl}/admin-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: `${tuesday}T07:00:00.000Z`,
        end: `${tuesday}T08:00:00.000Z`,
      }),
    });

    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );
    // гость видит слоты события (10:00, 10:30), а не сетку
    expect(await screen.findByText("10:30")).toBeInTheDocument();

    // админ удаляет событие
    await userEvent.click(
      await screen.findByRole("button", { name: "Админка" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Удалить" }),
    );

    // возвращаемся к гостю — без смены недели/типа видна дефолтная сетка
    await userEvent.click(
      await screen.findByRole("button", { name: "Записаться" }),
    );
    expect(await screen.findByText("11:15")).toBeInTheDocument(); // шаг 15 минут (сетка вернулась)
    expect(screen.queryByText("10:30")).toBeNull();
  });
});


describe("страницы: бронирование", () => {
  /** Список слотов выбранного дня (страница календаря). */
  function slotsList() {
    return screen.getByRole("list", { name: "Слоты" });
  }

  /** Рендерит календарь и выбирает первый свободный слот (панель выбора открыта). */
  async function selectFreeSlot() {
    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );
    const list = await screen.findByRole("list", { name: "Слоты" });
    const free = within(list).getAllByRole("button", {
      name: /Свободно/,
    })[0];
    await userEvent.click(free);
    await screen.findByText("Выбранная дата");
    return free;
  }

  /** Проходит поток до формы бронирования. */
  async function openBookingForm() {
    const free = await selectFreeSlot();
    await userEvent.click(
      screen.getByRole("button", { name: "Продолжить" }),
    );
    await screen.findByLabelText("Имя");
    return free;
  }

  test("полный поток: слот → «Продолжить» → форма → «Записаться» → сводка", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча 30 минут", durationMinutes: 30 }),
    });

    await selectFreeSlot();

    // панель выбора
    expect(screen.getByText("Выбранная дата")).toBeInTheDocument();
    expect(screen.getByText("Выбранное время")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Продолжить" }),
    );
    await userEvent.type(screen.getByLabelText("Имя"), "Иван Петров");
    await userEvent.type(
      screen.getByLabelText("Email"),
      "ivan@example.com",
    );
    await userEvent.type(
      screen.getByLabelText("Комментарий"),
      "Позвоните позже",
    );
    await userEvent.click(within(screen.getByRole("form", { name: "Форма записи" })).getByRole("button", { name: "Записаться" }));

    // сводка успеха: тип, дата, время, длительность (имя/email в сводку не входят)
    expect(await screen.findByText("Вы записаны")).toBeInTheDocument();
    expect(
      (await screen.findAllByText("Встреча 30 минут")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("form", { name: "Форма записи" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отменить" })).toBeNull();
  });

  test("имя и email обязательны — форма показывает ошибку", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    await openBookingForm();

    await userEvent.click(within(screen.getByRole("form", { name: "Форма записи" })).getByRole("button", { name: "Записаться" }));
    expect(
      await screen.findByText("Заполните имя и email"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Имя"), "Иван");
    await userEvent.type(screen.getByLabelText("Email"), "ivan@example.com");
    await userEvent.click(within(screen.getByRole("form", { name: "Форма записи" })).getByRole("button", { name: "Записаться" }));
    expect(await screen.findByText("Вы записаны")).toBeInTheDocument();
  });

  test("забронированный слот становится «Занято» после брони", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    const free = await openBookingForm();
    const freeText = free.textContent;

    await userEvent.type(screen.getByLabelText("Имя"), "Иван");
    await userEvent.type(screen.getByLabelText("Email"), "ivan@example.com");
    await userEvent.click(within(screen.getByRole("form", { name: "Форма записи" })).getByRole("button", { name: "Записаться" }));
    await screen.findByText("Вы записаны");

    // возврат к календарю: тот же слот теперь «Занято»
    await userEvent.click(
      screen.getByRole("button", { name: "К календарю" }),
    );
    await waitFor(() => {
      // тот же слот (по времени) теперь отображается «Занято»
      const time = freeText!.match(/\d{2}:\d{2}/)![0];
      const busy = within(slotsList())
        .queryAllByRole("button", { name: new RegExp(time) })
        .filter((b) => /Занято/.test(b.textContent ?? ""));
      expect(busy.length).toBeGreaterThan(0);
    });
    expect(freeText).toContain("Свободно"); // до брони был свободен
  });

  test("слот заняли между выбором и отправкой — сообщение и возврат к выбору", async () => {
    await fetch(`${baseUrl}/meeting-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Встреча", durationMinutes: 15 }),
    });

    const monday = weekStartOf(todayInDisplayZone());
    // первый свободный слот фейка — понедельник 07:15 UTC (10:15 UTC+3)
    const raceStart = `${monday}T07:15:00.000Z`;

    render(<App baseUrl={baseUrl} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Выбрать" }),
    );
    const list = await screen.findByRole("list", { name: "Слоты" });
    const free = within(list).getAllByRole("button", {
      name: /Свободно/,
    })[0];
    expect(free).toHaveTextContent("10:15");
    await userEvent.click(free);

    // другой гость занимает слот, пока наш гость выбирает время
    await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slotStart: raceStart,
        durationMinutes: 15,
        name: "Пётр",
        email: "petr@example.com",
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    await userEvent.type(screen.getByLabelText("Имя"), "Иван");
    await userEvent.type(screen.getByLabelText("Email"), "ivan@example.com");
    await userEvent.click(
      within(screen.getByRole("form", { name: "Форма записи" })).getByRole(
        "button",
        { name: "Записаться" },
      ),
    );

    // сообщение о занятости
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Слот уже занят/,
    );
    // форма закрыта, гость вернулся к выбору слота
    expect(
      screen.queryByRole("form", { name: "Форма записи" }),
    ).toBeNull();
    await screen.findByRole("list", { name: "Слоты" });
    // сетка перерисована: тот слот теперь «Занято» и недоступен
    const busySlot = within(
      screen.getByRole("list", { name: "Слоты" }),
    ).getByRole("button", { name: /10:15.*Занято/ });
    expect(busySlot).toBeDisabled();
  });
});
