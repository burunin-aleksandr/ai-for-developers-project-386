import { render, screen, waitFor } from "@testing-library/react";
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
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = new Date(d);
        day.setUTCDate(d.getUTCDate() + i);
        const dateStr = day.toISOString().slice(0, 10);
        // первый слот дня сдвигается на час с индексом дня — дни различимы во времени
        const hour = String(7 + i).padStart(2, "0");
        const slots = [0, 1, 2].map((j) => ({
          start: `${dateStr}T${hour}:${String(j * 15).padStart(2, "0")}:00.000Z`,
          end: `${dateStr}T${hour}:${String(j * 15 + 15).padStart(2, "0")}:00.000Z`,
          status: i === 0 && j === 0 ? "busy" : "free",
        }));
        return {
          date: dateStr,
          freeCount: slots.filter((s) => s.status === "free").length,
          slots,
        };
      });
      return send(200, { weekStart: days[0].date, days });
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
