import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { secrets } from "../db/schema";

/*
 * What a secret is, and how the api says so.
 *
 * State is not a column. It is derived from the timestamps every time a row is
 * read, which is what makes an expired envelope expired whether or not any sweep
 * has run: nothing has to happen for a clock to pass. The order is what happened
 * to the secret rather than what the clock did afterwards, so a burn or a reveal
 * outranks an expiry that came later.
 *
 * The comparison happens in the database. Both of a secret's timestamps come from
 * the database's own clock, so measuring one of them against this process's clock
 * would be measuring across two clocks that drift.
 *
 * What the answer carries is deliberately thin, and one absence is load-bearing:
 * nothing here says whether a password protects the envelope. The instance does not
 * know. The flag and the salt ride the fragment precisely so it cannot, and a field
 * added to this shape is how that would quietly stop being true.
 */

/** The four a row can be in. `used` and never `opened`: see the reveal route. */
export type SecretState = "sealed" | "used" | "burned" | "expired";

export interface SecretStatus {
  burnedAt: string | null;
  /** Who burned it, when somebody did. Only ever the sender in v0. */
  burnReason: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  state: SecretState;
  usedAt: string | null;
}

/**
 * The most ids one lookup may ask about. A device's memory is a convenience with
 * its own ceiling, so this is twice that: the browser is never the thing that
 * makes a request fail.
 */
export const MAX_STATUS_IDS = 200;

const columns = {
  burnedAt: secrets.burnedAt,
  burnReason: secrets.burnReason,
  createdAt: secrets.createdAt,
  expired: sql<boolean>`${secrets.expiresAt} <= now()`,
  expiresAt: secrets.expiresAt,
  id: secrets.id,
  usedAt: secrets.usedAt,
};

interface Row {
  burnedAt: Date | null;
  burnReason: string | null;
  createdAt: Date;
  expired: boolean;
  expiresAt: Date;
  id: string;
  usedAt: Date | null;
}

function stateOf(row: Row): SecretState {
  if (row.burnedAt !== null) {
    return "burned";
  }
  if (row.usedAt !== null) {
    return "used";
  }
  return row.expired ? "expired" : "sealed";
}

export function statusOf(row: Row): SecretStatus {
  return {
    burnedAt: row.burnedAt?.toISOString() ?? null,
    burnReason: row.burnReason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    id: row.id,
    state: stateOf(row),
    usedAt: row.usedAt?.toISOString() ?? null,
  };
}

/** Null when the instance has nothing, which never says why it has nothing. */
export async function lookUp(id: string): Promise<SecretStatus | null> {
  const [row] = await db
    .select(columns)
    .from(secrets)
    .where(eq(secrets.id, id));

  return row ? statusOf(row) : null;
}

/**
 * Every id the instance knows, in the order they were asked about. Ids it has
 * nothing for are absent rather than reported: the device doing the asking still
 * holds its own list, so it can tell which ones came back.
 */
export async function lookUpAll(
  ids: readonly string[]
): Promise<SecretStatus[]> {
  const rows = await db
    .select(columns)
    .from(secrets)
    .where(inArray(secrets.id, [...ids]));

  const byId = new Map(rows.map((row) => [row.id, statusOf(row)]));

  return ids.flatMap((id) => {
    const status = byId.get(id);
    return status ? [status] : [];
  });
}
