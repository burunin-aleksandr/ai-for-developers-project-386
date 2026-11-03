import { buildApp } from "../src/app";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** Любой понедельник в будущем — для детерминированных проверок. */
function futureWeekMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  const offsetToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

describe("HTTP API seam: бронирование", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test("создание записи возвращает запись со сводкой", async () => {
    const monday = futureWeekMonday();
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        durationMinutes: 15,
        name: "Иван Петров",
        email: "ivan@example.com",
        comment: "Позвоните позже",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      slotStart: `${monday}T07:00:00.000Z`,
      name: "Иван Петров",
      email: "ivan@example.com",
      comment: "Позвоните позже",
    });
    expect(res.json().id).toBeDefined();
  });

  test("имя и email обязательны — без них 400", async () => {
    const monday = futureWeekMonday();

    const noName = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        durationMinutes: 15,
        email: "a@b.c",
      },
    });
    expect(noName.statusCode).toBe(400);

    const noEmail = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        durationMinutes: 15,
        name: "Иван",
      },
    });
    expect(noEmail.statusCode).toBe(400);
  });

  test("комментарий опционален — запись создаётся без него", async () => {
    const monday = futureWeekMonday();
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        durationMinutes: 15,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().comment).toBeUndefined();
  });

  test("забронированный слот становится «Занято» для всех гостей", async () => {
    const monday = futureWeekMonday();
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        durationMinutes: 15,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });

    const body = res.json();
    const booked = body.days
      .flatMap((d: { slots: Array<{ start: string; status: string }> }) => d.slots)
      .find(
        (s: { start: string }) => s.start === `${monday}T07:00:00.000Z`,
      );
    expect(booked).toBeDefined();
    expect(booked.status).toBe("busy");
  });

  test("бронь на несуществующий слот отклоняется", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: "2020-01-06T07:00:00.000Z", // прошлая неделя — слотов нет
        durationMinutes: 15,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  test("над событиями бронируется только слот сета гостя (длительность типа)", async () => {
    const monday = futureWeekMonday();
    // событие 07:00–08:00 UTC, гость с типом 30 мин видит 07:00 и 07:30
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T07:00:00.000Z`,
        end: `${monday}T08:00:00.000Z`,
      },
    });

    // 07:15 — слот 15-минутной сетки, которого гость с типом 30 мин не видел
    const notOffered = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:15:00.000Z`,
        durationMinutes: 30,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(notOffered.statusCode).toBe(400);

    // 07:30 — целый слот сета гостя, бронь проходит
    const offered = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:30:00.000Z`,
        durationMinutes: 30,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(offered.statusCode).toBe(201);
  });
});
