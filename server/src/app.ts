import Fastify, { type FastifyInstance } from "fastify";
import { loadContractSchemas } from "./contract";
import { AdminEventStore } from "./admin-events-store";
import { MeetingTypeStore } from "./meeting-types-store";
import { isWithinBookingWindow, isValidDate, weekSlots } from "./slots";

const ERROR_BODY = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
} as const;

export function buildApp(): FastifyInstance {
  const app = Fastify();
  const schemas = loadContractSchemas();
  const meetingTypes = new MeetingTypeStore();
  const adminEvents = new AdminEventStore();

  app.get(
    "/health",
    {
      schema: {
        response: { 200: schemas.HealthStatus },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/slots",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            date: { type: "string" },
            durationMinutes: { type: "number", enum: [15, 30, 45, 60] },
          },
          required: ["date"],
        },
        response: {
          200: schemas.WeekSlots,
          400: ERROR_BODY,
        },
      },
    },
    async (req, reply) => {
      const { date } = req.query as { date?: unknown };
      // durationMinutes валидируется схемой (enum пресетов)
      if (!isValidDate(date)) {
        return reply
          .code(400)
          .send({ message: "Некорректная дата: ожидается YYYY-MM-DD" });
      }
      const { durationMinutes } = req.query as {
        durationMinutes?: number;
      };
      return reply.send(
        weekSlots(date, {
          events: adminEvents.list(),
          durationMinutes,
        }),
      );
    },
  );

  app.get(
    "/admin-events",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              adminEvents: { type: "array", items: schemas.AdminEvent },
            },
            required: ["adminEvents"],
          },
        },
      },
    },
    async () => ({ adminEvents: adminEvents.list() }),
  );

  app.post(
    "/admin-events",
    {
      schema: {
        body: schemas.AdminEventInput,
        response: { 201: schemas.AdminEvent, 400: ERROR_BODY },
      },
    },
    async (req, reply) => {
      const { start, end } = req.body as { start: string; end: string };
      if (!isWithinBookingWindow(start, end)) {
        return reply.code(400).send({
          message:
            "Интервал должен лежать в окне 10:00–18:00 UTC+3 и начинаться раньше, чем заканчиваться",
        });
      }
      return reply.code(201).send(adminEvents.create({ start, end }));
    },
  );

  app.delete(
    "/admin-events/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        response: { 204: { type: "null" }, 404: ERROR_BODY },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      if (!adminEvents.remove(id)) {
        return reply.code(404).send({ message: "Событие не найдено" });
      }
      return reply.code(204).send();
    },
  );

  app.get(
    "/meeting-types",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              meetingTypes: { type: "array", items: schemas.MeetingType },
            },
            required: ["meetingTypes"],
          },
        },
      },
    },
    async () => ({ meetingTypes: meetingTypes.list() }),
  );

  app.post(
    "/meeting-types",
    {
      schema: {
        body: schemas.MeetingTypeInput,
        response: { 201: schemas.MeetingType },
      },
    },
    async (req, reply) => {
      const created = meetingTypes.create(req.body as never);
      return reply.code(201).send(created);
    },
  );

  app.put(
    "/meeting-types/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
        body: schemas.MeetingTypeInput,
        response: {
          200: schemas.MeetingType,
          400: ERROR_BODY,
          404: ERROR_BODY,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: number };
      const updated = meetingTypes.update(id, req.body as never);
      if (!updated) {
        return reply.code(404).send({ message: "Тип встречи не найден" });
      }
      return reply.send(updated);
    },
  );

  return app;
}
