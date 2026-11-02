import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const openapiPath = resolve(
  import.meta.dirname,
  "../../spec/dist/openapi.yaml",
);

type OpenApiDocument = {
  components: {
    schemas: Record<string, Record<string, unknown>>;
  };
};

function loadOpenApi(): OpenApiDocument {
  return parse(readFileSync(openapiPath, "utf-8")) as OpenApiDocument;
}

export function loadContractSchemas() {
  return loadOpenApi().components.schemas;
}
