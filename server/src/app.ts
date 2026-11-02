import Fastify from "fastify";
import { loadContractSchemas } from "./contract";

export function buildApp() {
  const app = Fastify();
  const schemas = loadContractSchemas();

  app.get(
    "/health",
    {
      schema: {
        response: { 200: schemas.HealthStatus },
      },
    },
    async () => ({ status: "ok" }),
  );

  return app;
}
