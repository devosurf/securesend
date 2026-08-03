import type { AppType } from "@securesend/api";
import { hc } from "hono/client";

export interface ClientOptions {
  /** Substituted by a test that drives the api without a network. */
  fetch?: typeof globalThis.fetch | undefined;
  /** Where the api lives. This origin in a browser, always. */
  origin?: string | undefined;
}

/**
 * The api client, typed by the api's own routes so the two shapes cannot drift
 * apart. One process serves both the app and `/api`, so the default base is this
 * origin and there is no cross-origin request anywhere in the product.
 */
export function apiClient({ fetch, origin }: ClientOptions = {}) {
  return hc<AppType>(origin ?? "/", { ...(fetch && { fetch }) });
}
