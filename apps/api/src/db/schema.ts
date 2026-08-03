import { date, integer, pgTable } from "drizzle-orm/pg-core";

/**
 * Product health, one row per day. Nothing here is keyed by IP, secret or
 * session: "we cannot tell you who opened your secret" has to stay literally
 * true, so these counters are all we ever keep.
 */
export const dailyCounters = pgTable("daily_counters", {
  day: date().primaryKey(),
  creates: integer().notNull().default(0),
  reveals: integer().notNull().default(0),
  burns: integer().notNull().default(0),
  expiries: integer().notNull().default(0),
});
