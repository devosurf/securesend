import { join } from "node:path";
import { applyMigrations } from "./src/db/migrate";

/** The API seam runs against a real database, migrated by the same code as boot. */
export default async function setup(): Promise<void> {
  await applyMigrations(join(import.meta.dirname, "drizzle"));
}
