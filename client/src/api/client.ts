import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Типизированный клиент, сгенерированный из openapi.yaml.
 * Типы путей — из openapi-typescript, рантайм-обёртка — openapi-fetch.
 */
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}
