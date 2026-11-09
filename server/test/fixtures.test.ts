import {
  loadFixtures,
  startAdminEvents,
  startBookings,
} from "../../fixtures/startup-fixtures.mjs";
import { buildApp } from "../src/app";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("HTTP API seam: фикстуры", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  /** HTTP-клиент для loadFixtures поверх app.inject. */
  const client = {
    post: async (path: string, body: object) => {
      const res = await app.inject({
        method: "POST",
        url: path,
        payload: body,
      });
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
      };
    },
  };

  test("чистый старт: события и записи пусты — автозагрузки фикстур нет", async () => {
    const events = await app.inject({ method: "GET", url: "/admin-events" });
    expect(events.statusCode).toBe(200);
    expect(events.json().adminEvents).toEqual([]);

    const bookings = await app.inject({ method: "GET", url: "/bookings" });
    expect(bookings.statusCode).toBe(200);
    expect(bookings.json().bookings).toEqual([]);
  });

  test("после загрузки фикстур API отдаёт события и демо-записи", async () => {
    const expectedEvents = startAdminEvents();
    const expectedBookings = startBookings();
    const counts = await loadFixtures(client);

    expect(counts).toEqual({
      adminEvents: expectedEvents.length,
      bookings: expectedBookings.length,
    });

    const events = await app.inject({ method: "GET", url: "/admin-events" });
    expect(events.json().adminEvents).toHaveLength(expectedEvents.length);

    const bookings = await app.inject({ method: "GET", url: "/bookings" });
    expect(bookings.json().bookings).toHaveLength(expectedBookings.length);
    expect(
      bookings.json().bookings.map((b: { name: string }) => b.name),
    ).toEqual(expectedBookings.map((b) => b.name));

    // события и записи в будущем, внутри окна бронирования
    const now = Date.now();
    for (const e of events.json().adminEvents as Array<{
      start: string;
      end: string;
    }>) {
      expect(Date.parse(e.start)).toBeGreaterThan(now);
      expect(Date.parse(e.end)).toBeGreaterThan(Date.parse(e.start));
    }
    for (const b of bookings.json().bookings as Array<{
      slotStart: string;
    }>) {
      expect(Date.parse(b.slotStart)).toBeGreaterThan(now);
    }
  });
});
