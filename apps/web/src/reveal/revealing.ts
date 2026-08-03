import type { Ciphertext, OpenedEnvelope } from "@securesend/crypto/envelope";
import type { FragmentTokenResult } from "@securesend/crypto/fragment";
import { useEffect, useRef, useState } from "react";
import { type Answered, lookUp, spend, takeKey, unseal } from "./open-secret";
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
  /** The link was spent and what came back will not open with the key in it. */
  | "unreadable";

export interface Revealing {
  /** The clock the screen quotes, when the instance gave one. */
  answered: Answered | null;
  /** A press is in flight. The one control on screen stops taking input. */
  busy: boolean;
  /** Whether this envelope's key is only half of itself. From the link, not the api. */
  needsPassword: boolean;
  /** The one irreversible act. Spends the link, then opens what came back. */
  openIt: () => Promise<void>;
  password: string;
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
  /** A press reached nothing. Nothing was spent, so it can happen again. */
  unreached: boolean;
}

/*
 * The key, read once per page.
 *
 * takeKey empties the address bar as it reads, so a second read finds nothing.
 * React renders a component twice in development precisely to surface impure work in
 * a render, and this work is impure on purpose, so the memo lives out here rather
 * than in a ref or an effect, both of which get re-run by the same check.
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
  const key = keyForThisPage(`/s/${id}`);
  const needsPassword = key.status === "ok" && key.token.needsPassword;

  const [screen, setScreen] = useState<Screen>(
    key.status === "ok" ? "asking" : "incomplete"
  );
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [secret, setSecret] = useState<OpenedEnvelope | null>(null);
  const [password, setPassword] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [unreached, setUnreached] = useState(false);

  /* The ciphertext, once the press has taken it, and from then on the only copy of
   * this secret anywhere. Nothing draws it; what it is here for is the retry, which
   * opens it again with a different password and never asks the instance twice. */
  const [held, setHeld] = useState<Ciphertext | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  /*
   * The lookup, exactly once.
   *
   * Not a query and deliberately not cached: this answer is true at the moment it is
   * given and a refetch on a window regaining focus would paint "already used" over
   * an open secret. Nothing here retries either, because a link that could not be
   * asked about is a thing to say out loud rather than to keep quietly asking.
   */
  useEffect(() => {
    if (key.status !== "ok") {
      return () => undefined;
    }

    let listening = true;
    lookUp(id).then((arrival) => {
      if (!listening) {
        return;
      }
      setAnswered(arrival.answered ?? null);
      setScreen(arrival.state);
    });

    return () => {
      listening = false;
    };
  }, [id, key.status]);

  /** Opens what this tab holds, and picks the screen the answer means. */
  async function open(envelope: Ciphertext, tried: string) {
    if (key.status !== "ok") {
      return;
    }

    const opened = await unseal({
      envelope,
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
    setUnreached(false);
    setBusy(true);

    try {
      const spent = await spend(id);

      if (spent.status === "unreachable") {
        setUnreached(true);
        return;
      }
      if (spent.status === "gone") {
        setAnswered(spent.arrival.answered ?? null);
        setScreen(spent.arrival.state);
        return;
      }

      setHeld(spent.envelope);
      await open(spent.envelope, password);
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
   * The take, which is a clipboard write and nothing else.
   *
   * It is here rather than in the screen because the bar that reports it sits in two
   * different places at the two widths, inside the panel at a desk and on the page's
   * floor on a phone, and both have to agree about whether it has happened. A refused
   * clipboard leaves `taken` false, so the bar never claims a write the browser
   * declined.
   */
  async function takeAll() {
    if (!secret) {
      return;
    }

    await navigator.clipboard.writeText(allOf(secret));
    setTaken(true);
  }

  return {
    answered,
    busy,
    needsPassword,
    openIt: () => press(spendAndOpen),
    password,
    saveIt: () => setScreen("saved"),
    screen,
    secret,
    setPassword,
    takeAll,
    taken,
    tries,
    tryAgain: () => press(openAgain),
    unreached,
  };
}
