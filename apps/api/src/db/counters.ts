import { sql } from "drizzle-orm";
import type { db } from "./client";
import { dailyCounters } from "./schema";

/*
 * The day's tally, and the whole of what this instance knows about its own use.
 *
 * Four numbers per day and nothing beside them: no ip, no id, no session, no user
 * agent. "We cannot tell you who opened your secret" has to stay literally true, so
 * a counter is the most this product is allowed to learn, and a counter with a
 * dimension on it would stop being one.
 *
 * Every caller does this inside the transaction that did the thing, so a create or
 * a reveal that was refused cannot show up in the day's count.
 *
 * Three of the four are one at a time, because a person did them. Expiries are not:
 * nobody is present when a clock runs out, so the sweep finds however many ran out
 * since it last looked and counts them together, on the day it noticed.
 */

export type Counted = "creates" | "reveals" | "burns" | "expiries";

/** The half of a database handle this needs, so a transaction fits it as well. */
type Counting = Pick<typeof db, "insert">;

export function count(on: Counting, what: Counted, howMany = 1) {
  return on
    .insert(dailyCounters)
    .values({ [what]: howMany, day: sql`current_date` })
    .onConflictDoUpdate({
      set: { [what]: sql`${dailyCounters[what]} + ${howMany}` },
      target: dailyCounters.day,
    });
}
