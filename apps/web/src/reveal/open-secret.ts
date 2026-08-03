import {
  type AttachmentCiphertext,
  type Ciphertext,
  type OpenedEnvelope,
  openEnvelope,
} from "@securesend/crypto/envelope";
import {
  decodeFragmentToken,
  type FragmentToken,
} from "@securesend/crypto/fragment";
import { apiClient, type ClientOptions } from "../api/client";
import { readAnswer, type SecretState, type SecretTimes } from "../api/status";

/*
 * The recipient's whole crossing, from a link to plaintext.
 *
 * It is the mirror of the sender's, and it is the other place the zero-knowledge
 * rule has to hold: the key arrives in this tab, in the one part of a url browsers
 * do not send, and it must not leave the tab in any direction. Not into a request,
 * not into storage, and not into an address bar a browser would sync to every other
 * device signed into the same profile. So the key is read exactly once, here, and
 * taken out of the address on the way past.
 *
 * The crossing is four steps and the seams between them are the design:
 *
 *   takeKey   the fragment, out of the address bar. No request, so a link that
 *             arrived without its key is answered before anything is asked of the
 *             instance, and nothing is destroyed finding out.
 *   lookUp    what the instance says the link is. This one never consumes, which is
 *             what lets a preview bot land on a secret and break nothing.
 *   spend     the press. The only consuming call in the product, and the moment the
 *             server's copy dies. It happens once.
 *   unseal    opening what this tab now holds, locally, as many times as the
 *             recipient likes. A wrong password fails here, against ciphertext the
 *             server no longer has, which is why a retry costs nothing and why
 *             nobody could rate-limit it if they wanted to.
 *
 * Nothing here is ever logged. Every value in scope is a key, a password or a
 * secret, so an error carrying a detail would be an error carrying one of those.
 */

const OK = 200;
const NOT_FOUND = 404;

/**
 * This tab's address, which is the only place the key ever is.
 *
 * A seam rather than a global read, because the rule this module exists to keep is
 * about what leaves the tab, and that cannot be asserted against a real address bar.
 */
export interface Address {
  /** Everything after the `#`, the `#` included, exactly as the browser has it. */
  hash: string;
  /** The same address without its fragment, which is what may safely be kept. */
  path: string;
  /** Rewrites this tab's address in place, without navigating. */
  replace: (url: string) => void;
}

/** What the instance said, or what this browser found out instead. */
export type ArrivalState = SecretState | "missing" | "unreachable";

export type Answered = SecretTimes;

export interface Arrival {
  /** Absent for the two states the instance never answered at all. */
  answered?: Answered | undefined;
  state: ArrivalState;
}

/** Every ciphertext the secret was made of, which is one per part plus the json. */
export interface Held {
  attachments: AttachmentCiphertext[];
  envelope: Ciphertext;
}

export type Spent =
  /** The ciphertext, now in this tab and nowhere else on earth. */
  | ({ status: "held" } & Held)
  /** The press landed on something already dead. The page says which. */
  | { status: "gone"; arrival: Arrival }
  /** Nothing answered, so nothing was spent and the press can happen again. */
  | { status: "unreachable" };

export type Unsealed =
  | { status: "open"; secret: OpenedEnvelope }
  /** A wrong password, or a key that did not survive the trip. No request made. */
  | { status: "closed" };

function thisTab(): Address {
  const { hash, pathname, search } = window.location;

  return {
    hash,
    path: `${pathname}${search}`,
    replace(url) {
      window.history.replaceState(null, "", url);
    },
  };
}

/**
 * Reads the key out of the address bar and takes it out of the address bar, in that
 * order and once.
 *
 * The rewrite happens whether or not the fragment turned out to be a key, because
 * the point is not tidiness: what is left in the address is what the browser puts in
 * this device's history.
 */
export function takeKey(from: Address = thisTab()) {
  const encoded = from.hash.startsWith("#") ? from.hash.slice(1) : from.hash;

  from.replace(from.path);

  return decodeFragmentToken(encoded);
}

/* An answer this browser cannot read is not a dead secret, so it reads as nothing
 * having answered rather than as a link that died. */
function arrivalOf(said: unknown): Arrival {
  const answer = readAnswer(said);
  if (!answer) {
    return { state: "unreachable" };
  }

  const { id, state, ...answered } = answer;

  return { answered, state };
}

/**
 * What the instance says about this link, which consumes nothing.
 *
 * A link pasted into a chat is fetched by a preview bot before a human sees it, so
 * this is what the sealed page renders from and it is deliberately the only thing
 * that happens on arrival.
 */
export async function lookUp(
  id: string,
  around: ClientOptions = {}
): Promise<Arrival> {
  const look = apiClient(around).api.secrets[":id"].$get;

  let response: Awaited<ReturnType<typeof look>>;
  try {
    response = await look({ param: { id } });
  } catch {
    // Offline, a hung proxy, a blocked request. Nothing has happened to the
    // secret, and calling it missing would be a guess dressed as a fact.
    return { state: "unreachable" };
  }

  if (response.status === NOT_FOUND) {
    return { state: "missing" };
  }

  const said: unknown = await response.json().catch(() => null);

  return response.status === OK ? arrivalOf(said) : { state: "unreachable" };
}

/**
 * The press. It spends the link and hands back what the instance was holding, and
 * from here the ciphertext exists only in this tab.
 *
 * No password goes with it, because there is nothing on the other end that could
 * check one. That is the whole reason a wrong password is recoverable, and the
 * reason the recipient is told the cost before the press rather than after it.
 */
export async function spend(
  id: string,
  around: ClientOptions = {}
): Promise<Spent> {
  const press = apiClient(around).api.secrets[":id"].reveal.$post;

  let response: Awaited<ReturnType<typeof press>>;
  try {
    response = await press({ param: { id } });
  } catch {
    return { status: "unreachable" };
  }

  if (response.status === NOT_FOUND) {
    return { arrival: { state: "missing" }, status: "gone" };
  }

  const said: unknown = await response.json().catch(() => null);

  if (response.status === OK) {
    return isHeld(said)
      ? {
          attachments: said.attachments,
          envelope: said.envelope,
          status: "held",
        }
      : { status: "unreachable" };
  }

  /* A spent link comes back in the same shape the lookup returns, which is what keeps
   * the recipient's dead ends worded off one shape rather than two. */
  const arrival = arrivalOf(said);

  return arrival.answered
    ? { arrival, status: "gone" }
    : { status: "unreachable" };
}

function isCiphertext(value: unknown): value is Ciphertext {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { ciphertext, iv } = value as Record<string, unknown>;

  return typeof ciphertext === "string" && typeof iv === "string";
}

function isAttachment(value: unknown): value is AttachmentCiphertext {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { index } = value as Record<string, unknown>;

  return typeof index === "number" && isCiphertext(value);
}

/*
 * An answer this browser can work with, or not one at all.
 *
 * A secret with no files answers with an empty list rather than with no list, so
 * both halves have to be there. Reading it loosely would mean an answer that lost
 * its attachments on the way handed the recipient a note whose file quietly never
 * arrived, and there is no older instance to be lenient towards: the api and this
 * app ship in one container at one version.
 */
function isHeld(
  value: unknown
): value is { attachments: AttachmentCiphertext[]; envelope: Ciphertext } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { attachments, envelope } = value as Record<string, unknown>;

  return (
    Array.isArray(attachments) &&
    attachments.every(isAttachment) &&
    isCiphertext(envelope)
  );
}

/**
 * Opens what this tab is holding. Nothing here touches the network or any storage,
 * which is why the recipient can try a password again after the link is spent.
 *
 * Every way it fails is one answer, and that is not laziness in two senses. The
 * crypto package will not say whether a wrong password or a damaged key was the
 * problem, because saying would be the verifier this product promised not to build.
 * And by the time this runs the ciphertext exists only in this tab, so anything
 * thrown past here would take the secret with it: a shut envelope the recipient can
 * try again is always better than a page that fell over holding the only copy.
 */
export async function unseal(held: {
  attachments: AttachmentCiphertext[];
  envelope: Ciphertext;
  id: string;
  password?: string | undefined;
  token: FragmentToken;
}): Promise<Unsealed> {
  /* The token decides whether a password is part of the key at all, so this cannot
   * be handed a mismatch. One on an envelope that takes none is dropped; a missing
   * one on an envelope that needs one becomes an empty one, which does not open. */
  const password = held.token.needsPassword ? (held.password ?? "") : undefined;

  try {
    const secret = await openEnvelope({
      ...(password !== undefined && { password }),
      stored: {
        attachments: held.attachments,
        envelope: held.envelope,
        id: held.id,
      },
      token: held.token,
    });

    return { secret, status: "open" };
  } catch {
    return { status: "closed" };
  }
}
