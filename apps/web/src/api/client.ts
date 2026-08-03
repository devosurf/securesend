import type { AppType } from "@securesend/api";
import { hc } from "hono/client";

/** Typed by the API's own routes: the shapes cannot drift apart. */
export const client = hc<AppType>("/");
