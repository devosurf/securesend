import {
  customType,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Ciphertext, as bytes. It travels as base64url because the API takes JSON, and
 * it is stored decoded because the caps are byte caps and a third of every row
 * would otherwise be encoding.
 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
  toDriver(value) {
    return Buffer.from(value);
  },
});

/**
 * One envelope. Nothing here can be read by this process: the ciphertext columns
 * are opaque and the key that opens them never arrives.
 *
 * The two ciphertext columns are nullable because death is crypto-shredding. A
 * reveal, a burn and an expiry all scrub them and leave the rest of the row
 * standing as a tombstone, which is what lets the recipient be told the truth
 * about a link that is already gone.
 *
 * State is derived from the timestamps at read time rather than stored, so an
 * expired envelope is expired whether or not any sweep has run yet.
 */
export const secrets = pgTable("secrets", {
  id: text().primaryKey(),
  envelope: bytea(),
  envelopeIv: bytea(),
  /**
   * Only the hash. The token is 256 bits of randomness handed out once, so there
   * is nothing to salt against: a dictionary of guesses is not a thing that
   * exists.
   */
  managementTokenHash: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  burnedAt: timestamp({ withTimezone: true }),
  /** Who burned it. Only ever the sender in v0, and the recipient is told so. */
  burnReason: text(),
});

/**
 * A file's bytes, one row per attachment, encrypted on their own under the same
 * data key as the envelope that names them. The name, the size and the type are
 * inside that envelope and never here: this table holds bytes and a position.
 *
 * These rows are deleted rather than nulled when a secret dies, which is the one
 * place attachments differ from the envelope. A tombstone is status and
 * timestamps, and a row left standing with its ciphertext scrubbed would still
 * tell the next reader how many files there were and how big they had been.
 */
export const attachments = pgTable(
  "attachments",
  {
    secretId: text()
      .notNull()
      .references(() => secrets.id, { onDelete: "cascade" }),
    /** Its place in the envelope's file list, which is bound into its ciphertext. */
    index: integer().notNull(),
    ciphertext: bytea().notNull(),
    iv: bytea().notNull(),
  },
  (table) => [primaryKey({ columns: [table.secretId, table.index] })]
);

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
