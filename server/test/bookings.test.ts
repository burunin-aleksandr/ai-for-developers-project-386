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

  /** Создаёт тип встречи и возвращает его id. */
  async function createType(
    durationMinutes: 15 | 30 | 45 | 60,
  ): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: `Тип ${durationMinutes}`, durationMinutes },
    });
    return res.json().id as number;
  }

  test("создание записи возвращает запись со сводкой", async () => {
    const monday = futureWeekMonday();
    const typeId = await createType(15);
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
        name: "Иван Петров",
        email: "ivan@example.com",
        comment: "Позвоните позже",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      slotStart: `${monday}T07:00:00.000Z`,
      meetingTypeId: typeId,
      name: "Иван Петров",
      email: "ivan@example.com",
      comment: "Позвоните позже",
    });
    expect(res.json().id).toBeDefined();
  });

  test("имя и email обязательны — без них 400", async () => {
    const monday = futureWeekMonday();
    const typeId = await createType(15);

    const noName = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
        email: "a@b.c",
      },
    });
    expect(noName.statusCode).toBe(400);

    const noEmail = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
        name: "Иван",
      },
    });
    expect(noEmail.statusCode).toBe(400);
  });

  test("комментарий опционален — запись создаётся без него", async () => {
    const monday = futureWeekMonday();
    const typeId = await createType(15);
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().comment).toBeUndefined();
  });

  test("забронированный слот становится «Занято» для всех гостей", async () => {
    const monday = futureWeekMonday();
    const typeId = await createType(15);
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
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
    const typeId = await createType(15);
    const res = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: "2020-01-06T07:00:00.000Z", // прошлая неделя — слотов нет
        meetingTypeId: typeId,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  test("над событиями бронируется только слот сета гостя (длительность типа)", async () => {
    const monday = futureWeekMonday();
    const type30 = await createType(30);
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
        meetingTypeId: type30,
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
        meetingTypeId: type30,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(offered.statusCode).toBe(201);
  });

  test("пересечение интервалов разной длительности → 409", async () => {
    const monday = futureWeekMonday();
    const type60 = await createType(60);
    const type15 = await createType(15);
    // гость бронирует 07:00–08:00 (тип 60 мин)
    const first = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: type60,
        name: "Иван",
        email: "ivan@example.com",
      },
    });
    expect(first.statusCode).toBe(201);

    // другой гость с типом 15 мин берёт 07:30 — внутри занятого интервала
    const second = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:30:00.000Z`,
        meetingTypeId: type15,
        name: "Пётр",
        email: "petr@example.com",
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toMatch(/занят/i);

    // сетка уже показывает занятый интервал (07:00–08:00), а 08:00 свободен
    const grid = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });
    const byStart = Object.fromEntries(
      grid
        .json()
        .days.find((d: { date: string }) => d.date === monday)!.slots.map(
          (s: { start: string; status: string }) => [s.start, s.status],
        ),
    );
    expect(byStart[`${monday}T07:00:00.000Z`]).toBe("busy");
    expect(byStart[`${monday}T07:45:00.000Z`]).toBe("busy");
    expect(byStart[`${monday}T08:00:00.000Z`]).toBe("free");

    // непересекающийся интервал бронируется без проблем
    const third = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T08:00:00.000Z`,
        meetingTypeId: type15,
        name: "Пётр",
        email: "petr@example.com",
      },
    });
    expect(third.statusCode).toBe(201);
  });

  test("гонка: слот заняли между выбором и отправкой → 409", async () => {
    const monday = futureWeekMonday();
    const typeId = await createType(15);
    const payload = {
      slotStart: `${monday}T07:00:00.000Z`,
      meetingTypeId: typeId,
      name: "Иван",
      email: "ivan@example.com",
    };

    // оба гостя выбрали один и тот же слот
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

    // слот остаётся «Занято», запись не задвоена
    const slots = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });
    const booked = slots
      .json()
      .days.flatMap((d: { slots: Array<{ start: string; status: string }> }) =>
        d.slots,
      )
      .filter(
        (s: { start: string }) => s.start === payload.slotStart,
      );
    expect(booked).toHaveLength(1);
    expect(booked[0].status).toBe("busy");
  });

  test("GET /bookings отдаёт предстоящие записи с типом встречи по возрастанию", async () => {
    const monday = futureWeekMonday();
    const type30 = await createType(30);
    // создаём в обратном порядке — порядок в ответе должен быть по времени
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:30:00.000Z`,
        meetingTypeId: type30,
        name: "Пётр",
        email: "petr@example.com",
      },
    });
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: type30,
        name: "Иван",
        email: "ivan@example.com",
      },
    });

    const res = await app.inject({ method: "GET", url: "/bookings" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bookings).toHaveLength(2);
    expect(body.bookings.map((b: { slotStart: string }) => b.slotStart)).toEqual(
      [`${monday}T07:00:00.000Z`, `${monday}T07:30:00.000Z`],
    );
    expect(body.bookings[0]).toMatchObject({
      meetingTypeName: "Тип 30",
    });
    // личные данные гостя в список не входят — только тип, дата и время
    expect(JSON.stringify(body)).not.toContain("ivan@example.com");
    expect(JSON.stringify(body)).not.toContain("Иван");
  });

  test("прошедшие записи не входят в список предстоящих", async () => {
    let clock = new Date();
    await app.close();
    app = buildApp({ now: () => clock });

    const monday = futureWeekMonday();
    const typeId = await createType(15);
    await app.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        slotStart: `${monday}T07:00:00.000Z`,
        meetingTypeId: typeId,
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
