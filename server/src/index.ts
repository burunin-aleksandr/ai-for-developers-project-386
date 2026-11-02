import { buildApp } from "./app";

const app = buildApp();

app.listen({ port: 3000 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
