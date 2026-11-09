import { buildApp } from "../src/app";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Любая будущая дата (+14 дней) — для детерминированных проверок окна и шага. */
function futureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14); // две недели вперёд — гарантированно будущее
  return d.toISOString().slice(0, 10);
}

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает 1-е число месяца даты — старт сетки. */
function gridStartOf(date: string): string {
  const first = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  const offsetToMonday = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - offsetToMonday);
  return first.toISOString().slice(0, 10);
}

describe("HTTP API seam: слоты месяца", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test("сетка месяца: 42 дня, окно 09:00–18:00 UTC+3, шаг 30 минут", async () => {
    const date = futureDate();
    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${date}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toHaveLength(42);

    const day = body.days.find((d: { date: string }) => d.date === date);
    expect(day).toBeDefined();
    expect(day.freeCount).toBe(18); // 9 часов × 2 слота в час
    expect(day.slots).toHaveLength(18);

    // первый слот: 09:00 UTC+3 = 06:00 UTC
    expect(day.slots[0].start).toBe(`${date}T06:00:00.000Z`);
    // последний слот заканчивается в 18:00 UTC+3 = 15:00 UTC
    expect(day.slots.at(-1).end).toBe(`${date}T15:00:00.000Z`);
    // шаг 30 минут
    expect(day.slots[1].start).toBe(`${date}T06:30:00.000Z`);
    // все слоты свободны
    expect(
      day.slots.every((s: { status: string }) => s.status === "free"),
    ).toBe(true);
  });

  test("даты: 42 дня пн–вс, старт — понедельник недели 1-го числа", async () => {
    const date = futureDate();
    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${date}`,
    });

    const body = res.json();
    expect(body.month).toBe(`${date.slice(0, 7)}-01`);
    const start = gridStartOf(date);
    expect(body.days.map((d: { date: string }) => d.date)).toEqual(
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(`${start}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      }),
    );
    // сетка всегда начинается с понедельника
    expect(new Date(`${body.days[0].date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  test("прошедшее время не возвращается", async () => {
    const now = Date.now();
    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${mondayOfCurrentWeek()}`,
    });

    const body = res.json();
    const starts = body.days.flatMap(
      (d: { slots: Array<{ start: string }> }) => d.slots.map((s) => s.start),
    );
    for (const start of starts) {
      expect(new Date(start).getTime()).toBeGreaterThanOrEqual(now - 60_000);
    }
  });

  test("прошлый месяц полностью пустой (всё время в прошлом)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/slots?date=2020-01-06",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.month).toBe("2020-01-01");
    expect(body.days).toHaveLength(42);
    expect(
      body.days.every(
        (d: { slots: unknown[]; freeCount: number }) =>
          d.slots.length === 0 && d.freeCount === 0,
      ),
    ).toBe(true);
  });

  test("недостающая или некорректная дата — 400", async () => {
    const noDate = await app.inject({ method: "GET", url: "/slots" });
    expect(noDate.statusCode).toBe(400);

    const badDate = await app.inject({
      method: "GET",
      url: "/slots?date=not-a-date",
    });
    expect(badDate.statusCode).toBe(400);
  });
});
