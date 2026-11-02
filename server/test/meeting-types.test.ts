import { buildApp } from "../src/app";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("HTTP API seam: типы встреч", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test("создание типа встречи возвращает созданный тип", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: {
        name: "Встреча 15 минут",
        description: "Короткий тип встречи.",
        durationMinutes: 15,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: "Встреча 15 минут",
      description: "Короткий тип встречи.",
      durationMinutes: 15,
    });
    expect(res.json().id).toBeDefined();
  });

  test("длительность вне пресетов отклоняется", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Странная", durationMinutes: 20 },
    });

    expect(res.statusCode).toBe(400);
  });

  test("редактирование с длительностью вне пресетов отклоняется", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Валидный", durationMinutes: 15 },
    });

    const res = await app.inject({
      method: "PUT",
      url: `/meeting-types/${created.json().id}`,
      payload: { name: "Валидный", durationMinutes: 20 },
    });

    expect(res.statusCode).toBe(400);
  });

  test("нечисловой id в пути отклоняется", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/meeting-types/abc",
      payload: { name: "X", durationMinutes: 15 },
    });

    expect(res.statusCode).toBe(400);
  });

  test("список типов отдаёт созданные типы", async () => {
    await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Встреча 15 минут", durationMinutes: 15 },
    });

    const res = await app.inject({ method: "GET", url: "/meeting-types" });

    expect(res.statusCode).toBe(200);
    expect(res.json().meetingTypes).toHaveLength(1);
    expect(res.json().meetingTypes[0]).toMatchObject({
      name: "Встреча 15 минут",
      durationMinutes: 15,
    });
  });

  test("редактирование типа встречи обновляет поля", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Было", durationMinutes: 15 },
    });

    const res = await app.inject({
      method: "PUT",
      url: `/meeting-types/${created.json().id}`,
      payload: { name: "Стало", description: "Новое", durationMinutes: 30 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: "Стало",
      description: "Новое",
      durationMinutes: 30,
    });
  });

  test("удаление типа встречи не предусмотрено", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Удаляемый", durationMinutes: 15 },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/meeting-types/${created.json().id}`,
    });

    expect(res.statusCode).toBe(404);
  });
});
