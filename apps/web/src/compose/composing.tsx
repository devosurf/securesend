import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAtDesk } from "../lib/lane";
import { SETTLE_MS } from "../ui/collapse";
import {
  type Draft,
  type Expiry,
  MAX_ENVELOPE_BYTES,
  pairIsFilled,
  type SecretLink,
  SendFailedError,
  type SendProblem,
  sealAndSend,
} from "./seal-and-send";

/*
 * One sender's session, from an empty box to a link.
 *
 * It is a context rather than a component's own state because the design puts the
 * composer in two places at once. On a desk everything is in the panel. On a
 * phone the affordances and the action are pinned to the floor of the page, below
 * everything the page has to say about itself, so a thumb can reach them while
 * reading. Those two are far apart in the document and they are the same session.
 *
 * What is not here: files, the device's history, and burning. Files are their own
 * work, and the history and the burn belong to the sender's watching side.
 */

type Stage = "compose" | "sent";

/* `open` outlives the part it belongs to by one settle, so the slot it lived in has
 * something to close over before the part is unmounted. */
interface Pair {
  open: boolean;
  password: string;
  username: string;
}

interface Seal {
  open: boolean;
  value: string;
}

/** What the phone's share control last managed to do. */
export type Handoff = "idle" | "shared" | "copied";

/**
 * The shortest the envelope may be seen to go quiet.
 *
 * The wait is real work and it is allowed to represent nothing else: encrypting a
 * note is a few milliseconds, and a password is a few hundred because deriving a
 * key from one is deliberately slow. Without a floor, the one moment the product's
 * promise is visible would sometimes be a flicker. The floor is the dim's own fade
 * plus one settle, which is the least a state can be shown in and be read.
 * Nothing caps it: a slow browser takes as long as it takes.
 */
const LOCK_FLOOR_MS = 410;

/**
 * How the receipt says an expiry, so it says it the way the setting did. Typed
 * against the api's three presets, so one added there and not here will not
 * compile.
 *
 * These are the same three phrases as `EXPIRY_OPTIONS` in the kit's expiry picker
 * and they have to stay the same, because the receipt is quoting the setting back.
 * They are written twice rather than shared because the kit takes props and never
 * knowledge: it cannot import the api's `Expiry`, and this record has to be keyed
 * by it to stay exhaustive.
 */
const SPOKEN: Record<Expiry, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "72h": "72 hours",
};

const KIB = 1024;

export interface Composing {
  addPair: () => void;
  addSeal: () => void;
  /** Every affordance that can make a part, so a removed part can hand focus back. */
  affordances: {
    pairAtDesk: RefObject<HTMLButtonElement | null>;
    pairOnPhone: RefObject<HTMLButtonElement | null>;
    seal: RefObject<HTMLButtonElement | null>;
  };
  /** See useAtDesk: only for what cannot be on screen before the sender acts. */
  atDesk: boolean;
  /** True once the sender has typed anything worth sealing. */
  canSend: boolean;
  copied: boolean;
  /** Whether the link is now on the clipboard, which a browser is free to refuse. */
  copyLink: () => Promise<boolean>;
  expiry: Expiry;
  fields: {
    seal: RefObject<HTMLInputElement | null>;
    username: RefObject<HTMLInputElement | null>;
  };
  focused: boolean;
  handoff: Handoff;
  /** The cap that was hit, in bytes, when that is why nothing was sent. */
  limit: number;
  link: SecretLink | null;
  locking: boolean;
  note: string;
  onBlur: () => void;
  onFocus: () => void;
  pair: Pair | null;
  problem: SendProblem | null;
  removePair: () => void;
  removeSeal: () => void;
  seal: Seal | null;
  send: () => Promise<void>;
  sendAnother: () => void;
  setExpiry: (value: string) => void;
  setNote: (value: string) => void;
  setPairPassword: (value: string) => void;
  setSealPassword: (value: string) => void;
  setUsername: (value: string) => void;
  shareLink: () => Promise<void>;
  stage: Stage;
  /** The phone's introduction is spent once the sender starts. A latch, never a toggle. */
  started: boolean;
}

const ComposeContext = createContext<Composing | null>(null);

export function useComposing(): Composing {
  const composing = use(ComposeContext);
  if (!composing) {
    throw new Error("this belongs inside ComposeProvider");
  }
  return composing;
}

export function spokenExpiry(expiry: Expiry): string {
  return SPOKEN[expiry];
}

/** "256 KB", for the one sentence that has to name a cap. */
export function spokenSize(bytes: number): string {
  const kib = bytes / KIB;
  return kib >= KIB ? `${(kib / KIB).toFixed(1)} MB` : `${Math.round(kib)} KB`;
}

function isExpiry(value: string): value is Expiry {
  return Object.hasOwn(SPOKEN, value);
}

/** Whatever is left of the floor, so the quiet moment is never a flicker. */
function restOfTheFloor(startedAt: number): Promise<void> {
  const left = LOCK_FLOOR_MS - (performance.now() - startedAt);

  return left > 0
    ? new Promise((done) => {
        setTimeout(done, left);
      })
    : Promise.resolve();
}

/**
 * Whether the link is now on the clipboard. It is attempted as part of the press
 * that made it, because pasting is the sender's next move either way and the
 * thing being replaced on the clipboard is usually the secret itself. A browser
 * that refuses the write after an await is common enough that the receipt has to
 * read the answer rather than assume it.
 */
async function toClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function problemOf(error: unknown): SendProblem {
  return error instanceof SendFailedError ? error.problem : "refused";
}

function limitOf(error: unknown): number {
  return error instanceof SendFailedError && error.limit !== undefined
    ? error.limit
    : MAX_ENVELOPE_BYTES;
}

export function ComposeProvider({ children }: { children: ReactNode }) {
  const atDesk = useAtDesk();

  const [stage, setStage] = useState<Stage>("compose");
  const [locking, setLocking] = useState(false);
  const [started, setStarted] = useState(false);
  const [focused, setFocused] = useState(false);

  const [note, setTyped] = useState("");
  const [pair, setPair] = useState<Pair | null>(null);
  const [seal, setSeal] = useState<Seal | null>(null);
  const [expiry, setChosen] = useState<Expiry>("24h");

  const [link, setLink] = useState<SecretLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>("idle");
  const [problem, setProblem] = useState<SendProblem | null>(null);
  const [limit, setLimit] = useState(MAX_ENVELOPE_BYTES);

  const usernameField = useRef<HTMLInputElement>(null);
  const sealField = useRef<HTMLInputElement>(null);
  const sealAffordance = useRef<HTMLButtonElement>(null);
  const pairAtDesk = useRef<HTMLButtonElement>(null);
  const pairOnPhone = useRef<HTMLButtonElement>(null);
  const blurring = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const hasPair = pair !== null;
  const hadPair = useRef(false);
  const hasSeal = seal !== null;
  const hadSeal = useRef(false);

  useEffect(() => {
    if (hasPair && !hadPair.current) {
      // The pair is worth nothing until it is filled, so the caret goes straight
      // into it. preventScroll because the slot is still opening.
      usernameField.current?.focus({ preventScroll: true });
    } else if (!hasPair && hadPair.current) {
      /* Back to the affordance the row came from: "where did that go" needs an
       * answer you can see. Both lanes are asked, and the one whose affordance is
       * not on screen cannot take focus, so the visible one gets it. */
      pairAtDesk.current?.focus({ preventScroll: true });
      pairOnPhone.current?.focus({ preventScroll: true });
    }
    hadPair.current = hasPair;
  }, [hasPair]);

  useEffect(() => {
    if (hasSeal && !hadSeal.current) {
      sealField.current?.focus({ preventScroll: true });
    } else if (!hasSeal && hadSeal.current) {
      sealAffordance.current?.focus({ preventScroll: true });
    }
    hadSeal.current = hasSeal;
  }, [hasSeal]);

  /* Exactly what sealAndSend will and will not carry, asked with its own
   * predicate, plus the one thing it cannot answer: a seal row the sender opened
   * and left empty holds the send until they fill it or take it off. */
  const hasSomething =
    note.trim() !== "" || (pair !== null && pairIsFilled(pair));
  const canSend = hasSomething && !(seal !== null && seal.value === "");

  function draftOf(): Draft {
    return {
      ...(pair && {
        credentials: { password: pair.password, username: pair.username },
      }),
      ...(seal && { password: seal.value }),
      expiry,
      note,
    };
  }

  async function crossing() {
    setProblem(null);
    setLocking(true);
    const startedAt = performance.now();

    try {
      const made = await sealAndSend(draftOf());
      await restOfTheFloor(startedAt);

      setCopied(await toClipboard(made.href));
      setLink(made);
      setStage("sent");
    } catch (error) {
      await restOfTheFloor(startedAt);
      setProblem(problemOf(error));
      setLimit(limitOf(error));
    } finally {
      setLocking(false);
    }
  }

  /*
   * One press, one secret.
   *
   * A busy button stops a second click, because it stops taking pointer events,
   * but not a second Enter on a button that already holds focus. Two crossings
   * would seal two envelopes and hand the sender only the second link, leaving the
   * first one live, remembered and invisible: a secret nobody knows exists, on a
   * server, until it expires.
   *
   * So a second press joins the crossing already in flight rather than starting
   * another. It is held in a ref rather than read off `locking`, because this has
   * to be true before the next line rather than after the next render.
   */
  function send(): Promise<void> {
    inFlight.current ??= crossing().finally(() => {
      inFlight.current = null;
    });

    return inFlight.current;
  }

  async function copyLink(): Promise<boolean> {
    if (!link) {
      return false;
    }

    const landed = await toClipboard(link.href);
    setCopied(landed);
    return landed;
  }

  /* A refusal was about what was in the envelope, so changing the envelope
   * retires it. Otherwise a sender who has just trimmed a note that was too long
   * is still being told it is too long. */
  function edited() {
    setProblem(null);
  }

  /*
   * The phone's handoff. A share sheet is what a sender on a phone actually
   * reaches for, and it is the one place the whole link leaves the page in one
   * gesture.
   *
   * The two ways it does not happen are different events and must not be treated
   * as one. A device without a sheet cannot do the thing at all, so the control
   * does the next most useful thing and says which one it did. A sender who opened
   * the sheet and backed out decided against it, and putting the secret's link on
   * their clipboard anyway would be the product doing something with a secret that
   * nobody asked it to do.
   */
  async function shareLink() {
    if (!link) {
      return;
    }

    if (typeof navigator.share !== "function") {
      setHandoff((await toClipboard(link.href)) ? "copied" : "idle");
      return;
    }

    try {
      await navigator.share({ text: link.href, title: "A secret for you" });
      setHandoff("shared");
    } catch {
      // Cancelled. Nothing happened, so nothing changes.
    }
  }

  const composing: Composing = {
    addPair() {
      setPair({ open: true, password: "", username: "" });
    },
    addSeal() {
      setSeal({ open: true, value: "" });
    },
    affordances: { pairAtDesk, pairOnPhone, seal: sealAffordance },
    atDesk,
    canSend,
    copied,
    copyLink,
    expiry,
    fields: { seal: sealField, username: usernameField },
    focused,
    handoff,
    limit,
    link,
    locking,
    note,
    onBlur() {
      // A press on a control in the phone's bar blurs the field for an instant.
      // Deciding on the next tick means the bar's own buttons do not read as the
      // sender having stopped.
      blurring.current = window.setTimeout(() => setFocused(false));
    },
    onFocus() {
      window.clearTimeout(blurring.current);
      setFocused(true);
      setStarted(true);
    },
    pair,
    problem,
    removePair() {
      setPair((now) => (now ? { ...now, open: false } : now));
      window.setTimeout(() => setPair(null), SETTLE_MS);
    },
    removeSeal() {
      setSeal((now) => (now ? { ...now, open: false } : now));
      window.setTimeout(() => setSeal(null), SETTLE_MS);
    },
    seal,
    send,
    sendAnother() {
      setStage("compose");
      setStarted(false);
      setCopied(false);
      setHandoff("idle");
      setProblem(null);
      setLink(null);
      setTyped("");
      setPair(null);
      setSeal(null);
    },
    setExpiry(value) {
      if (isExpiry(value)) {
        setChosen(value);
      }
    },
    setNote(value) {
      edited();
      setTyped(value);
    },
    setPairPassword(value) {
      edited();
      setPair((now) => (now ? { ...now, password: value } : now));
    },
    setSealPassword(value) {
      edited();
      setSeal((now) => (now ? { ...now, value } : now));
    },
    setUsername(value) {
      edited();
      setPair((now) => (now ? { ...now, username: value } : now));
    },
    shareLink,
    stage,
    started: started && !atDesk,
  };

  return <ComposeContext value={composing}>{children}</ComposeContext>;
}
