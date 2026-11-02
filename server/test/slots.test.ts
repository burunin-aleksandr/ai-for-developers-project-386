import { buildApp } from "../src/app";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Любой понедельник в будущем — для детерминированных проверок окна и шага. */
function futureWeekMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14); // две недели вперёд — гарантированно будущее
  const day = d.getUTCDay(); // 0=вс
  const offsetToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

describe("HTTP API seam: слоты недели", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test("будущая неделя: 7 дней, окно 10:00–18:00 UTC+3, шаг 15 минут", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${futureWeekMonday()}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toHaveLength(7);

    const [firstDay] = body.days;
    expect(firstDay.freeCount).toBe(32); // 8 часов × 4 слота в час
    expect(firstDay.slots).toHaveLength(32);

    // первый слот: 10:00 UTC+3 = 07:00 UTC
    expect(firstDay.slots[0].start).toBe(
      `${firstDay.date}T07:00:00.000Z`,
    );
    // последний слот заканчивается в 18:00 UTC+3 = 15:00 UTC
    expect(firstDay.slots.at(-1).end).toBe(`${firstDay.date}T15:00:00.000Z`);
    // шаг 15 минут
    expect(firstDay.slots[1].start).toBe(
      `${firstDay.date}T07:15:00.000Z`,
    );
    // все слоты свободны (бронирование появится в соседнем тикете)
    expect(firstDay.slots.every((s: { status: string }) => s.status === "free")).toBe(true);
  });

  test("даты возвращаются как понедельник–воскресенье недели даты", async () => {
    const monday = futureWeekMonday();
    const res = await app.inject({ method: "GET", url: `/slots?date=${monday}` });

    const body = res.json();
    expect(body.weekStart).toBe(monday);
    expect(body.days.map((d: { date: string }) => d.date)).toEqual(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${monday}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      }),
    );
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

  test("прошлая неделя полностью пустая (всё время в прошлом)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/slots?date=2020-01-06", // понедельник
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weekStart).toBe("2020-01-06");
    expect(body.days).toHaveLength(7);
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
