import Fastify, { type FastifyInstance } from "fastify";
import { loadContractSchemas } from "./contract";
import { MeetingTypeStore } from "./meeting-types-store";

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
