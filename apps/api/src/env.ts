const DEFAULT_PORT = 3000;

const KIB = 1024;
const MIB = 1024 * KIB;

/**
 * The most ciphertext one envelope's json part may be. The note, the credentials
 * and the file metadata all live in that one blob, so this is the cap on how much
 * a sender can type. File bytes are separate ciphertexts and ride the total below.
 */
const DEFAULT_MAX_ENVELOPE_BYTES = 256 * KIB;

/**
 * The most one secret may weigh: the json part plus every attachment. This is the
 * cap that decides what the instance stores, and it is a total rather than a
 * per-file limit because what costs the instance is the row, not the file count.
 */
const DEFAULT_MAX_TOTAL_BYTES = 10 * MIB;

/**
 * How many files one envelope may carry. Not a storage limit, since the total
 * above already is one: it bounds the number of ciphertexts a single request can
 * make this process decode, and it is far past what a handover of credentials
 * plausibly needs.
 */
const DEFAULT_MAX_ATTACHMENTS = 10;

const {
  DATABASE_URL,
  PORT,
  MAX_ENVELOPE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_ATTACHMENTS,
} = process.env;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env for development."
  );
}

/** A cap that read as NaN would refuse every envelope, so it is refused here. */
function size(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!(Number.isInteger(parsed) && parsed > 0)) {
    throw new Error(`${name} is not a positive whole number of bytes.`);
  }

  return parsed;
}

export const env = {
  databaseUrl: DATABASE_URL,
  maxAttachments: size(
    "MAX_ATTACHMENTS",
    MAX_ATTACHMENTS,
    DEFAULT_MAX_ATTACHMENTS
  ),
  maxEnvelopeBytes: size(
    "MAX_ENVELOPE_BYTES",
    MAX_ENVELOPE_BYTES,
    DEFAULT_MAX_ENVELOPE_BYTES
  ),
  maxTotalBytes: size(
    "MAX_TOTAL_BYTES",
    MAX_TOTAL_BYTES,
    DEFAULT_MAX_TOTAL_BYTES
  ),
  port: Number(PORT ?? DEFAULT_PORT),
};
