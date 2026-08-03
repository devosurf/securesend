import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../env";

/**
 * Applies pending migrations on a connection of its own, then hangs up. The
 * app boots through this, so a container that is up has its schema applied.
 */
export async function applyMigrations(migrationsFolder: string): Promise<void> {
  const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
