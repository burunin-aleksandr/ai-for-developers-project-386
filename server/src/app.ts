import Fastify, { type FastifyInstance } from "fastify";
import { loadContractSchemas } from "./contract";
import { AdminEventStore } from "./admin-events-store";
import { BookingStore } from "./bookings-store";
import { intervalsIntersect } from "./intervals";
import {
  isExistingSlotStart,
  isWithinBookingWindow,
  isValidDate,
  monthSlots,
  slotInterval,
} from "./slots";

const ERROR_BODY = {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
} as const;

export type BuildAppOptions = {
  /** Текущий момент (для тестов); по умолчанию — системные часы. */
  now?: () => Date;
};

export function buildApp({ now = () => new Date() }: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  const schemas = loadContractSchemas();
  const adminEvents = new AdminEventStore();
  const bookings = new BookingStore();

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
          },
          required: ["date"],
        },
        response: {
          200: schemas.MonthSlots,
          400: ERROR_BODY,
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
      return reply.send(
        monthSlots(date, {
          events: adminEvents.list(),
          busyIntervals: bookings.busyIntervals(),
          now: now(),
        }),
      );
    },
  );

  app.get(
    "/bookings",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              bookings: { type: "array", items: schemas.Booking },
            },
            required: ["bookings"],
          },
        },
      },
    },
    async () => ({
      // предстоящие записи: имя, email, слот и момент создания
      bookings: bookings.listUpcoming(now()),
    }),
  );

  app.post(
    "/bookings",
    {
      schema: {
        body: schemas.BookingInput,
        response: {
          201: schemas.Booking,
          400: ERROR_BODY,
          409: schemas.ErrorBody,
        },
      },
    },
    async (req, reply) => {
      const { slotStart, name, email } = req.body as {
        slotStart: string;
        name: string;
        email: string;
      };

      if (!name.trim() || !email.trim()) {
        return reply
          .code(400)
          .send({ message: "Имя и email обязательны" });
      }

      const moment = now();

      // бронируется только целый слот из фиксированной сетки
      if (!isExistingSlotStart(slotStart, { now: moment })) {
        return reply
          .code(400)
          .send({ message: "Слот не существует или уже в прошлом" });
      }

      // антидубль: слот занят записью или событием админа
      const interval = slotInterval(slotStart)!;
      const eventBusy = adminEvents.list().some((event) =>
        intervalsIntersect(
          Date.parse(interval.start),
          Date.parse(interval.end),
          Date.parse(event.start),
          Date.parse(event.end),
        ),
      );
      if (bookings.overlaps(slotStart) || eventBusy) {
        return reply
          .code(409)
          .send({ message: "Слот уже занят — выберите другой" });
      }

      return reply.code(201).send(
        bookings.create(
          { slotStart, name: name.trim(), email: email.trim() },
          moment,
        ),
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
            "Интервал должен лежать в окне 09:00–18:00 UTC+3 и начинаться раньше, чем заканчиваться",
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

  return app;
}
