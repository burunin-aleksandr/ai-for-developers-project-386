import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const openapiPath = resolve(
  import.meta.dirname,
  "../../spec/dist/openapi.yaml",
);

type JsonSchema = Record<string, unknown>;

type OpenApiDocument = {
  components: {
    schemas: Record<string, JsonSchema>;
  };
};

function loadOpenApi(): OpenApiDocument {
  return parse(readFileSync(openapiPath, "utf-8")) as OpenApiDocument;
}

/** Разворачивает локальные `$ref: '#/components/schemas/X'` вглубь схемы. */
function resolveRefs(
  node: unknown,
  schemas: Record<string, JsonSchema>,
  seen = new Set<string>(),
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, schemas, seen));
  }
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const ref = obj.$ref;
    if (typeof ref === "string") {
      const name = ref.replace("#/components/schemas/", "");
      if (seen.has(name)) return obj; // защита от циклов
      const target = schemas[name];
      if (!target) return obj;
      seen.add(name);
      const resolved = resolveRefs(target, schemas, seen);
      seen.delete(name);
      return resolved;
    }
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key,
        resolveRefs(value, schemas, seen),
      ]),
    );
  }
  return node;
}

export function loadContractSchemas(): Record<string, JsonSchema> {
  const { schemas } = loadOpenApi().components;
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      resolveRefs(schema, schemas) as JsonSchema,
    ]),
  );
}
