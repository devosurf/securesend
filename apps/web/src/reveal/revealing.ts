import type { OpenedEnvelope } from "@securesend/crypto/envelope";
import type { FragmentTokenResult } from "@securesend/crypto/fragment";
import { useEffect, useRef, useState } from "react";
import { saveFile } from "./downloads";
import {
  type Answered,
  type Held,
  lookUp,
  spend,
  takeKey,
  unseal,
} from "./open-secret";
import { allOf } from "./parts";

/*
 * The recipient's side as a state machine, because it is one.
 *
 * Eleven screens, and they divide in two, which is the whole structure of this page.
 * Six are arrived in: the link is what it is when you get here and no press on this
 * page can reach them. Five are pressed into, from the latch.
 *
 * That division matters because of what the press costs. Everything before it is
 * free, repeatable and honest about what it does not know. The press is the one
 * irreversible act in the product, and after it the only copy of the secret is in
 * this tab, so everything past it is written to keep that copy alive: a second Enter
 * cannot spend a second time, a wrong password does not lose the ciphertext, and
 * nothing thrown can take the page down while it is the only place the secret lives.
 */

/** What to say to wait for, when a refusal carried no number of its own. */
const A_MINUTE_S = 60;

export type Screen =
  /** Asking the instance what this link is. One request, and it consumes nothing. */
  | "asking"
  | "sealed"
  | "retry"
  | "open"
  | "saved"
  /** The dead ends. Arrived in, except when a press lands on one. */
  | "used"
  | "burned"
  | "expired"
  | "missing"
  | "incomplete"
  | "unreachable"
  /** The instance declined to be asked this often. The link is untouched. */
  | "too-fast"
  /** The link was spent and what came back will not open with the key in it. */
  | "unreadable";

/**
 * Why a press changed nothing, when one did not.
 *
 * Both belong on the latch rather than on a screen of their own, because in both cases
 * the link is exactly what it was and the button that failed is still the button: a
 * page that navigated away from the latch to report them would be taking the retry off
 * the screen. They are told apart because the way out differs, and because "nothing
 * answered" said about an instance that answered immediately is simply false.
 */
export type NothingHappened = "no-answer" | "too-fast";

export interface Revealing {
  /** The clock the screen quotes, when the instance gave one. */
  answered: Answered | null;
  /** A press is in flight. The one control on screen stops taking input. */
  busy: boolean;
  /** Whether this envelope's key is only half of itself. From the link, not the api. */
  needsPassword: boolean;
  /** A press that changed nothing. Nothing was spent, so it can happen again. */
  nothingHappened: NothingHappened | null;
  /** The one irreversible act. Spends the link, then opens what came back. */
  openIt: () => Promise<void>;
  password: string;
  /** Whole seconds the instance asked to be left alone for, when it asked. */
  retryAfter: number;
  saveIt: () => void;
  screen: Screen;
  /** Present once the envelope is open, and only in this tab. */
  secret: OpenedEnvelope | null;
  setPassword: (value: string) => void;
  /** Puts the whole secret on the clipboard, in one press. */
  takeAll: () => Promise<void>;
  /** Whether that press has happened, which the bar has to keep saying. */
  taken: boolean;
  /** How many tries have happened in this tab. Never how many are left. */
  tries: number;
  /** Opens what this tab holds again, with whatever was typed. No request. */
  tryAgain: () => Promise<void>;
}

/*
 * The key, taken once per page.
 *
 * takeKey empties the address bar as it reads, so a second read finds nothing. Two
 * things make that happen more than once if it is not guarded. React renders and runs
 * effects twice in development, deliberately, to surface work that cannot be repeated;
 * and rewriting the address is exactly that kind of work, which is why the memo lives
 * out here rather than in a ref, where the same check would rebuild it.
 *
 * Keyed on the path, so a different secret is a different read.
 */
let read: { key: FragmentTokenResult; path: string } | null = null;

function keyForThisPage(path: string): FragmentTokenResult {
  if (read?.path !== path) {
    read = { key: takeKey(), path };
  }

  return read.key;
}

export function useRevealing(id: string): Revealing {
  /* Not read during a render, because taking the key rewrites this tab's address and
   * the router is listening: a history change made while rendering is a state update in
   * another component while rendering. So the first paint is `asking`, which draws
   * nothing, and the effect below decides within a frame. */
  const [key, setKey] = useState<FragmentTokenResult | null>(null);
  const needsPassword = key?.status === "ok" && key.token.needsPassword;

  const [screen, setScreen] = useState<Screen>("asking");
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [secret, setSecret] = useState<OpenedEnvelope | null>(null);
  const [password, setPassword] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [nothingHappened, setNothingHappened] =
    useState<NothingHappened | null>(null);
  const [retryAfter, setRetryAfter] = useState(A_MINUTE_S);

  /* The ciphertext, once the press has taken it, and from then on the only copy of
   * this secret anywhere. Nothing draws it; what it is here for is the retry, which
   * opens it again with a different password and never asks the instance twice. */
  const [held, setHeld] = useState<Held | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  /*
   * The key, and then the lookup. Once each.
   *
   * A link that arrived without its key is answered here, before anything is asked of
   * the instance, which is what makes that dead end calm: nothing was fetched and
   * nothing was destroyed finding out.
   *
   * The lookup is not a query and deliberately not cached: this answer is true at the
   * moment it is given, and a refetch on a window regaining focus would paint "already
   * used" over an open secret. Nothing here retries either, because a link that could
   * not be asked about is a thing to say out loud rather than to keep quietly asking.
   */
  useEffect(() => {
    const mine = keyForThisPage(`/s/${id}`);
    setKey(mine);

    if (mine.status !== "ok") {
      setScreen("incomplete");
      return () => undefined;
    }

    let listening = true;
    lookUp(id).then((arrival) => {
      if (!listening) {
        return;
      }
      setAnswered(arrival.answered ?? null);
      if (arrival.retryAfter !== undefined) {
        setRetryAfter(arrival.retryAfter);
      }
      setScreen(arrival.state);
    });

    return () => {
      listening = false;
    };
  }, [id]);

  /** Opens what this tab holds, and picks the screen the answer means. */
  async function open(ciphertexts: Held, tried: string) {
    if (key?.status !== "ok") {
      return;
    }

    const opened = await unseal({
      ...ciphertexts,
      id,
      ...(key.token.needsPassword && { password: tried }),
      token: key.token,
    });

    if (opened.status === "open") {
      setSecret(opened.secret);
      setScreen("open");
      return;
    }

    /* Shut. With a password that is almost always a typo, and it is worth another
     * go on ciphertext the server no longer has. Without one there is nothing to
     * try differently: the key in the link is not the key that opens this. */
    if (key.token.needsPassword) {
      setTries((count) => count + 1);
      setPassword("");
      setScreen("retry");
      return;
    }

    setScreen("unreadable");
  }

  /*
   * One press, one spend.
   *
   * A busy button stops a second click, because it stops taking pointer events, but
   * not a second Enter on a button that already holds focus. Two presses would be
   * two reveals, and the instance would answer the second one "already used": the
   * recipient's own second keystroke would take the secret off the screen it had
   * just arrived on. So a second press joins the press already happening, held in a
   * ref because it has to be true before the next line rather than after the next
   * render.
   */
  function press(work: () => Promise<void>): Promise<void> {
    inFlight.current ??= work().finally(() => {
      inFlight.current = null;
    });

    return inFlight.current;
  }

  async function spendAndOpen() {
    setNothingHappened(null);
    setBusy(true);

    try {
      const spent = await spend(id);

      if (spent.status === "unreachable") {
        setNothingHappened("no-answer");
        return;
      }
      /* Refused for pace. The latch stays exactly where it is, because the link does
       * too: this is the one failed press that costs the recipient nothing at all. */
      if (spent.status === "too-fast") {
        setRetryAfter(spent.retryAfter);
        setNothingHappened("too-fast");
        return;
      }
      if (spent.status === "gone") {
        setAnswered(spent.arrival.answered ?? null);
        setScreen(spent.arrival.state);
        return;
      }

      const ciphertexts = {
        attachments: spent.attachments,
        envelope: spent.envelope,
      };

      setHeld(ciphertexts);
      await open(ciphertexts, password);
    } finally {
      setBusy(false);
    }
  }

  async function openAgain() {
    if (!held) {
      return;
    }

    setBusy(true);
    try {
      await open(held, password);
    } finally {
      setBusy(false);
    }
  }

  /*
   * The take: one press, two destinations.
   *
   * The recipient does not care whether a thing travels by clipboard or by
   * download, only that it is out of here before the tab closes. So this stops
   * making them pick a container and does both in the same gesture.
   *
   * The files go first, and before anything is awaited, because a download may
   * only be started while the press is still the browser's idea of a user gesture
   * and an await spends that. A refused clipboard then leaves `taken` false, so
   * the bar never claims a write the browser declined, while the files it already
   * started are on their way regardless: half a secret out of a dying tab beats
   * none of it.
   *
   * It is here rather than in the screen because the bar that reports it sits in
   * two different places at the two widths, inside the panel at a desk and on the
   * page's floor on a phone, and both have to agree about whether it happened.
   */
  async function takeAll() {
    if (!secret) {
      return;
    }

    for (const file of secret.files) {
      saveFile(file);
    }

    const text = allOf(secret);
    if (text !== "") {
      await navigator.clipboard.writeText(text);
    }

    setTaken(true);
  }

  return {
    answered,
    busy,
    needsPassword,
    nothingHappened,
    openIt: () => press(spendAndOpen),
    password,
    retryAfter,
    saveIt: () => setScreen("saved"),
    screen,
    secret,
    setPassword,
    takeAll,
    taken,
    tries,
    tryAgain: () => press(openAgain),
  };
}
