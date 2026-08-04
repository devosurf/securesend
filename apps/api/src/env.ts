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

/*
 * The pace each route is willing to be called at, as a sustained rate per hour and a
 * burst that may be spent back to back. Both numbers are needed: a rate alone refuses
 * an admin onboarding three people in one minute, and a burst alone lets one caller
 * spend a day's worth in a second.
 *
 * The defaults are set from what the product's own use looks like. A sender making a
 * handover makes one create; a recipient makes one status read and one reveal; a
 * homepage makes one batch status read per load and one per re-check. Everything here
 * is far past that and still nowhere near what a flood needs to be worth running.
 */
const DEFAULT_CREATE_PER_HOUR = 60;
const DEFAULT_CREATE_BURST = 10;
const DEFAULT_REVEAL_PER_HOUR = 120;
const DEFAULT_REVEAL_BURST = 20;
const DEFAULT_STATUS_PER_HOUR = 600;
const DEFAULT_STATUS_BURST = 60;

/**
 * The watermark: what the whole instance will take, across every caller at once.
 *
 * This is the number that decides what a flood from many addresses can cost, because
 * the per-caller buckets above are keyed on something the caller chooses. At the
 * default and a 72 hour ceiling, the most this instance can be holding is about
 * 21,600 secrets, so a self-hoster sizing a disk should read it together with
 * `MAX_TOTAL_BYTES` rather than on its own.
 */
const DEFAULT_INSTANCE_CREATE_PER_HOUR = 300;
const DEFAULT_INSTANCE_CREATE_BURST = 60;

const AN_HOUR_MS = 60 * 60 * 1000;

const {
  CLIENT_IP_HEADER,
  CREATE_BURST,
  CREATE_PER_HOUR,
  DATABASE_URL,
  INSTANCE_CREATE_BURST,
  INSTANCE_CREATE_PER_HOUR,
  MAX_ATTACHMENTS,
  MAX_ENVELOPE_BYTES,
  MAX_TOTAL_BYTES,
  PORT,
  REVEAL_BURST,
  REVEAL_PER_HOUR,
  STATUS_BURST,
  STATUS_PER_HOUR,
} = process.env;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env for development."
  );
}

/**
 * One whole number above zero, or this process does not start.
 *
 * Every knob here is a cap or a pace, and both fail the same silent way: a number read
 * as NaN would refuse every envelope, and a zero would refuse every caller. Refusing
 * to boot is the loud version of that, and it happens on the operator's own terminal
 * rather than in a user's browser.
 */
function size(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!(Number.isInteger(parsed) && parsed > 0)) {
    throw new Error(`${name} is not a positive whole number.`);
  }

  return parsed;
}

/**
 * One route's pace, as the bucket wants it. A rate of zero would refuse every caller
 * and a burst of zero would refuse the first, so both are held above zero here rather
 * than discovered in production.
 */
function pace(
  name: string,
  perHour: string | undefined,
  burst: string | undefined,
  defaults: { burst: number; perHour: number }
) {
  return {
    capacity: size(`${name}_BURST`, burst, defaults.burst),
    refillMs: AN_HOUR_MS / size(`${name}_PER_HOUR`, perHour, defaults.perHour),
  };
}

export const env = {
  /**
   * Which header carries the caller's address, when a proxy in front of this instance
   * puts it in one. Unset means the socket, which is the only answer nobody can forge.
   *
   * It has to be named rather than guessed. A limiter that trusts `x-forwarded-for`
   * by default is a limiter anybody defeats with one header, so an operator says which
   * header their own proxy always overwrites, and takes on knowing that it does.
   */
  clientIpHeader: CLIENT_IP_HEADER,
  createPace: pace("CREATE", CREATE_PER_HOUR, CREATE_BURST, {
    burst: DEFAULT_CREATE_BURST,
    perHour: DEFAULT_CREATE_PER_HOUR,
  }),
  databaseUrl: DATABASE_URL,
  instanceCreatePace: pace(
    "INSTANCE_CREATE",
    INSTANCE_CREATE_PER_HOUR,
    INSTANCE_CREATE_BURST,
    {
      burst: DEFAULT_INSTANCE_CREATE_BURST,
      perHour: DEFAULT_INSTANCE_CREATE_PER_HOUR,
    }
  ),
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
  revealPace: pace("REVEAL", REVEAL_PER_HOUR, REVEAL_BURST, {
    burst: DEFAULT_REVEAL_BURST,
    perHour: DEFAULT_REVEAL_PER_HOUR,
  }),
  statusPace: pace("STATUS", STATUS_PER_HOUR, STATUS_BURST, {
    burst: DEFAULT_STATUS_BURST,
    perHour: DEFAULT_STATUS_PER_HOUR,
  }),
};
