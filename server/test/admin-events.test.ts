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

describe("HTTP API seam: события админа", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test("создание события возвращает событие с id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T06:00:00.000Z", // 09:00 UTC+3
        end: "2026-11-10T07:00:00.000Z", // 10:00 UTC+3
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      start: "2026-11-10T06:00:00.000Z",
      end: "2026-11-10T07:00:00.000Z",
    });
    expect(res.json().id).toBeDefined();
  });

  test("интервал вне окна 09:00–18:00 UTC+3 отклоняется", async () => {
    const tooEarly = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T05:00:00.000Z", // 08:00 UTC+3 — до окна
        end: "2026-11-10T06:00:00.000Z",
      },
    });
    expect(tooEarly.statusCode).toBe(400);

    const tooLate = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T14:00:00.000Z", // 17:00 UTC+3
        end: "2026-11-10T16:00:00.000Z", // 19:00 UTC+3 — после окна
      },
    });
    expect(tooLate.statusCode).toBe(400);

    // границы окна включительно
    const early = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T06:00:00.000Z",
        end: "2026-11-10T07:00:00.000Z",
      },
    });
    expect(early.statusCode).toBe(201);

    const late = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T14:00:00.000Z",
        end: "2026-11-10T15:00:00.000Z",
      },
    });
    expect(late.statusCode).toBe(201);
  });

  test("интервал с концом раньше начала отклоняется", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T08:00:00.000Z",
        end: "2026-11-10T07:00:00.000Z",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  test("удаление события возвращает 204, повторное — 404", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T06:00:00.000Z",
        end: "2026-11-10T07:00:00.000Z",
      },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/admin-events/${created.json().id}`,
    });
    expect(del.statusCode).toBe(204);

    const again = await app.inject({
      method: "DELETE",
      url: `/admin-events/${created.json().id}`,
    });
    expect(again.statusCode).toBe(404);
  });

  test("событие помечает пересекающиеся слоты занятыми, сетка остаётся полной", async () => {
    const monday = futureWeekMonday();
    // событие 09:00–10:00 UTC+3 = 06:00–07:00 UTC
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T06:00:00.000Z`,
        end: `${monday}T07:00:00.000Z`,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });

    expect(res.statusCode).toBe(200);
    const day = res
      .json()
      .days.find((d: { date: string }) => d.date === monday);
    expect(day.slots).toHaveLength(18); // фиксированная сетка не сужается

    const byStart = Object.fromEntries(
      day.slots.map((s: { start: string; status: string }) => [
        s.start,
        s.status,
      ]),
    );
    expect(byStart[`${monday}T06:00:00.000Z`]).toBe("busy");
    expect(byStart[`${monday}T06:30:00.000Z`]).toBe("busy");
    expect(byStart[`${monday}T07:00:00.000Z`]).toBe("free");
  });

  test("после удаления события слоты снова свободны", async () => {
    const monday = futureWeekMonday();
    const created = await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T06:00:00.000Z`,
        end: `${monday}T07:00:00.000Z`,
      },
    });
    await app.inject({
      method: "DELETE",
      url: `/admin-events/${created.json().id}`,
    });

    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });

    expect(res.statusCode).toBe(200);
    const day = res
      .json()
      .days.find((d: { date: string }) => d.date === monday);
    expect(day.slots).toHaveLength(18);
    expect(
      day.slots.every((s: { status: string }) => s.status === "free"),
    ).toBe(true);
  });

  test("пересекающиеся события не дают дубликатов слотов", async () => {
    const monday = futureWeekMonday();
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T06:00:00.000Z`,
        end: `${monday}T08:00:00.000Z`,
      },
    });
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: `${monday}T06:00:00.000Z`,
        end: `${monday}T07:00:00.000Z`,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/slots?date=${monday}`,
    });

    const starts = res
      .json()
      .days.find((d: { date: string }) => d.date === monday)
      .slots.map((s: { start: string }) => s.start);
    expect(starts).toHaveLength(18);
    expect(starts).toEqual([...new Set(starts)]); // без дубликатов
  });

  test("список событий отдаёт созданные события", async () => {
    await app.inject({
      method: "POST",
      url: "/admin-events",
      payload: {
        start: "2026-11-10T06:00:00.000Z",
        end: "2026-11-10T07:00:00.000Z",
      },
    });

    const res = await app.inject({ method: "GET", url: "/admin-events" });

    expect(res.statusCode).toBe(200);
    expect(res.json().adminEvents).toHaveLength(1);
    expect(res.json().adminEvents[0]).toMatchObject({
      start: "2026-11-10T06:00:00.000Z",
      end: "2026-11-10T07:00:00.000Z",
    });
  });
});
