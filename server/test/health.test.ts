import { buildApp } from "../src/app";
import { afterAll, describe, expect, test } from "vitest";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const openapi = parse(
  readFileSync(
    resolve(import.meta.dirname, "../../spec/dist/openapi.yaml"),
    "utf-8",
  ),
) as {
  components: { schemas: Record<string, Record<string, unknown>> };
};

describe("HTTP API seam", () => {
  const app = buildApp();

  afterAll(() => app.close());

  test("GET /health возвращает статус ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  test("ответ GET /health валидируется по сгенерированной схеме OpenAPI", async () => {
    const validate = new Ajv().compile(
      openapi.components.schemas.HealthStatus,
    );

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(validate(res.json())).toBe(true);
  });
});
