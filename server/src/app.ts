import Fastify, { type FastifyInstance } from "fastify";
import { loadContractSchemas } from "./contract";
import { MeetingTypeStore } from "./meeting-types-store";
import { isValidDate, weekSlots } from "./slots";

export function buildApp(): FastifyInstance {
  const app = Fastify();
  const schemas = loadContractSchemas();
  const meetingTypes = new MeetingTypeStore();

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
          properties: { date: { type: "string" } },
          required: ["date"],
        },
        response: {
          200: schemas.WeekSlots,
          400: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        },
      },
    },
    async (req, reply) => {
      const { date } = req.query as { date?: unknown };
      if (!isValidDate(date)) {
        return reply
          .code(400)
          .send({ message: "Некорректная дата: ожидается YYYY-MM-DD" });
      }
      return reply.send(weekSlots(date));
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
          400: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
          404: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
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
