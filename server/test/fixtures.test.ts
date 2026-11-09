import {
  START_MEETING_TYPES,
  loadFixtures,
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

  test("чистый старт: типы и события пусты — автозагрузки фикстур нет", async () => {
    const types = await app.inject({ method: "GET", url: "/meeting-types" });
    expect(types.statusCode).toBe(200);
    expect(types.json().meetingTypes).toEqual([]);

    const events = await app.inject({ method: "GET", url: "/admin-events" });
    expect(events.statusCode).toBe(200);
    expect(events.json().adminEvents).toEqual([]);
  });

  test("после загрузки фикстур API отдаёт стартовые типы и события", async () => {
    const counts = await loadFixtures(client);

    expect(counts).toEqual({
      meetingTypes: START_MEETING_TYPES.length,
      adminEvents: 2,
    });

    const types = await app.inject({ method: "GET", url: "/meeting-types" });
    expect(
      types.json().meetingTypes.map((t: { name: string }) => t.name),
    ).toEqual(START_MEETING_TYPES.map((t) => t.name));

    const events = await app.inject({ method: "GET", url: "/admin-events" });
    expect(events.json().adminEvents).toHaveLength(2);

    // события в будущем и внутри окна бронирования (валидация сервера их пропустила)
    const now = Date.now();
    for (const e of events.json().adminEvents as Array<{
      start: string;
      end: string;
    }>) {
      expect(Date.parse(e.start)).toBeGreaterThan(now);
      expect(Date.parse(e.end)).toBeGreaterThan(Date.parse(e.start));
    }
  });
});
