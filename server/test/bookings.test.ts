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

  test("создание записи возвращает запись с createdAt", async () => {
    const monday = futureWeekMonday();
    const slotStart = `${monday}T06:00:00.000Z`;
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart,
        name: "Иван Петров",
        email: "ivan@example.com",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      slotStart,
      name: "Иван Петров",
      email: "ivan@example.com",
    });
    expect(body.id).toBeDefined();
    expect(typeof body.createdAt).toBe("string");
    expect(new Date(body.createdAt).getTime()).not.toBeNaN();
  });

  test("имя и email обязательны — без них 400", async () => {
    const monday = futureWeekMonday();
    const slotStart = `${monday}T06:00:00.000Z`;

    const noName = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotStart, email: "a@b.c" },
    });
    expect(noName.statusCode).toBe(400);

    const noEmail = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotStart, name: "Иван" },
    });
    expect(noEmail.statusCode).toBe(400);

    const blank = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { slotStart, name: "   ", email: "   " },
    });
    expect(blank.statusCode).toBe(400);
  });

  test("забронированный слот становится «Занято» для всех гостей", async () => {
    const monday = futureWeekMonday();
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:00:00.000Z`,
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
        (s: { start: string }) => s.start === `${monday}T06:00:00.000Z`,
      );
    expect(booked).toBeDefined();
    expect(booked.status).toBe("busy");
  });

  test("бронь на несуществующий слот отклоняется", async () => {
    const monday = futureWeekMonday();

    // прошлое
    const past = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: "2020-01-06T06:00:00.000Z",
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(past.statusCode).toBe(400);

    // не на 30-минутной границе
    const offGrid = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:15:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(offGrid.statusCode).toBe(400);

    // до открытия окна (08:30 UTC+3)
    const tooEarly = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T05:30:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(tooEarly.statusCode).toBe(400);

    // 18:00 UTC+3 — слот закончился бы за пределами окна
    const tooLate = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T15:00:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(tooLate.statusCode).toBe(400);
  });

  test("слот, занятый событием админа, забронировать нельзя", async () => {
    const monday = futureWeekMonday();
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T06:00:00.000Z`,
        end: `${monday}T07:00:00.000Z`,
      },
    });

    const busy = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:30:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().message).toMatch(/занят/i);

    // сразу после события слот свободен
    const free = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(free.statusCode).toBe(201);
  });

  test("гонка: слот заняли между выбором и отправкой → 409", async () => {
    const monday = futureWeekMonday();
    const payload = {
      slotStart: `${monday}T06:00:00.000Z`,
      name: "Иван",
      email: "ivan@example.com",
    };

    expect(
      (await app.inject({ method: "POST", url: "/bookings", payload }))
        .statusCode,
    ).toBe(201);
    const late = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { ...payload, name: "Пётр", email: "petr@example.com" },
    });
    expect(late.statusCode).toBe(409);
    expect(late.json().message).toMatch(/занят/i);

    // соседний слот свободен
    const adjacent = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:30:00.000Z`,
        name: "Пётр",
        email: "petr@example.com",
      },
    });
    expect(adjacent.statusCode).toBe(201);
  });

  test("GET /bookings отдаёт предстоящие записи с именем, email и createdAt по возрастанию", async () => {
    const monday = futureWeekMonday();
    // создаём в обратном порядке — порядок в ответе должен быть по времени
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:30:00.000Z`,
        name: "Пётр",
        email: "petr@example.com",
      },
    });
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:00:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    const res = await app.inject({ method: "GET", url: "/bookings" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bookings).toHaveLength(2);
    expect(body.bookings.map((b: { slotStart: string }) => b.slotStart)).toEqual(
      [`${monday}T06:00:00.000Z`, `${monday}T06:30:00.000Z`],
    );
    expect(body.bookings[0]).toMatchObject({
      name: "Иван",
      email: "ivan@example.com",
    });
    expect(typeof body.bookings[0].createdAt).toBe("string");
  });

  test("прошедшие записи не входят в список предстоящих", async () => {
    let clock = new Date();
    await app.close();
    app = buildApp({ now: () => clock });

    const monday = futureWeekMonday();
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T06:00:00.000Z`,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    const before = await app.inject({ method: "GET", url: "/bookings" });
    expect(before.json().bookings).toHaveLength(1);

    // время ушло далеко вперёд — запись стала прошедшей
    clock = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const after = await app.inject({ method: "GET", url: "/bookings" });
    expect(after.json().bookings).toHaveLength(0);
  });
});
