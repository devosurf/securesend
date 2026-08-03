const DEFAULT_PORT = 3000;

const KIB = 1024;

/**
 * The most ciphertext one envelope's json part may be. The note, the credentials
 * and (later) the file metadata all live in that one blob, so this is the cap on
 * how much a sender can type. File bytes are separate ciphertexts and get their
 * own cap.
 */
const DEFAULT_MAX_ENVELOPE_BYTES = 256 * KIB;

const { DATABASE_URL, PORT, MAX_ENVELOPE_BYTES } = process.env;

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
  maxEnvelopeBytes: size(
    "MAX_ENVELOPE_BYTES",
    MAX_ENVELOPE_BYTES,
    DEFAULT_MAX_ENVELOPE_BYTES
  ),
  port: Number(PORT ?? DEFAULT_PORT),
};
