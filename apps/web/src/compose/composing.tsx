import {
  createContext,
  type DragEvent,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import { WAIT_IF_UNSAID } from "../api/refusal";
import { useAtDesk } from "../lib/lane";
import { SETTLE_MS } from "../ui/collapse";
import {
  type Draft,
  type Expiry,
  MAX_ENVELOPE_BYTES,
  overCap,
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
 * A dropped file is the third place: the drop target is the whole page, because a
 * sender dragging a file at the browser is aiming at the window rather than at a
 * rectangle, and what says where it will land is the panel lighting up. The page
 * binds the handlers, the panel reads the state, and both are here.
 *
 * What is not here: the device's history and burning, which belong to the
 * sender's watching side.
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

/**
 * A file in the envelope: the row, and not the bytes.
 *
 * The read still starts the moment the file is attached rather than at send, and
 * that is what keeps the row honest: a file edited on disk between attaching it
 * and pressing Create link cannot quietly change what gets sealed. What changed
 * is when the row is drawn. Reading ten megabytes off a phone's disk is not free,
 * and a gesture that shows nothing until it finishes reads as a gesture the page
 * missed, so the row lands on the press with what the picker already said and the
 * bytes catch up behind it.
 *
 * The bytes are not in here because they are not in state at all. See `held`.
 */
interface Attachment {
  id: number;
  name: string;
  open: boolean;
  /** What the picker said it weighs, replaced by the bytes' own once they land. */
  size: number;
  type: string;
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

export interface Composing {
  addPair: () => void;
  addSeal: () => void;
  /** Every affordance that can make a part, so a removed part can hand focus back. */
  affordances: {
    attachAtDesk: RefObject<HTMLButtonElement | null>;
    attachOnPhone: RefObject<HTMLButtonElement | null>;
    pairAtDesk: RefObject<HTMLButtonElement | null>;
    pairOnPhone: RefObject<HTMLButtonElement | null>;
    seal: RefObject<HTMLButtonElement | null>;
  };
  /** A file is over the page, so the panel is saying where it would land. */
  armed: boolean;
  /** Reads what was chosen into the envelope, or says why it will take none of it. */
  attach: (chosen: ArrayLike<File>) => Promise<void>;
  /** True once the sender has put anything worth sealing in the box. */
  canSend: boolean;
  copied: boolean;
  /** Whether the link is now on the clipboard, which a browser is free to refuse. */
  copyLink: () => Promise<boolean>;
  /** What the page binds so a file dropped anywhere on it lands in the envelope. */
  dragging: {
    onDragEnter: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
  expiry: Expiry;
  fields: {
    /** This device's own picker, which on a phone is where photos live too. */
    picker: RefObject<HTMLInputElement | null>;
    seal: RefObject<HTMLInputElement | null>;
    username: RefObject<HTMLInputElement | null>;
  };
  files: Attachment[];
  focused: boolean;
  handoff: Handoff;
  /** The cap that was hit when that is why nothing was sent: bytes, or a count. */
  limit: number;
  link: SecretLink | null;
  locking: boolean;
  note: string;
  onBlur: () => void;
  onFocus: () => void;
  pair: Pair | null;
  pickFiles: () => void;
  problem: SendProblem | null;
  removeFile: (id: number) => void;
  removePair: () => void;
  removeSeal: () => void;
  /** Whole seconds to wait, when waiting is why nothing was sent. */
  retryAfter: number;
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

/** Whether what is being dragged is a file at all, rather than selected text. */
function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return [...event.dataTransfer.types].includes("Files");
}

/** What the envelope's files weigh, which is nearly all of what the cap measures. */
function weightOf(files: readonly Attachment[]): number {
  return files.reduce((sum, one) => sum + one.size, 0);
}

function limitOf(error: unknown): number {
  return error instanceof SendFailedError && error.limit !== undefined
    ? error.limit
    : MAX_ENVELOPE_BYTES;
}

/** What the instance asked for, when it asked for a wait rather than a smaller secret. */
function waitOf(error: unknown): number {
  return error instanceof SendFailedError && error.retryAfter !== undefined
    ? error.retryAfter
    : WAIT_IF_UNSAID;
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
  const [files, setFiles] = useState<Attachment[]>([]);
  const [armed, setArmed] = useState(false);
  const [expiry, setChosen] = useState<Expiry>("24h");

  const [link, setLink] = useState<SecretLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [handoff, setHandoff] = useState<Handoff>("idle");
  const [problem, setProblem] = useState<SendProblem | null>(null);
  const [limit, setLimit] = useState(MAX_ENVELOPE_BYTES);
  const [retryAfter, setRetryAfter] = useState(WAIT_IF_UNSAID);

  const usernameField = useRef<HTMLInputElement>(null);
  const sealField = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const sealAffordance = useRef<HTMLButtonElement>(null);
  const pairAtDesk = useRef<HTMLButtonElement>(null);
  const pairOnPhone = useRef<HTMLButtonElement>(null);
  const attachAtDesk = useRef<HTMLButtonElement>(null);
  const attachOnPhone = useRef<HTMLButtonElement>(null);
  const blurring = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const nextFile = useRef(1);
  /*
   * The bytes, held outside state, for two reasons and the first is correctness. A
   * press can land in the gap between a row appearing and its file finishing being
   * read, so what that press seals has to be readable before the next render rather
   * than after it. The second is that a secret runs to ten megabytes and state is
   * for what the screen draws. The screen never draws these.
   */
  const held = useRef(new Map<number, Uint8Array<ArrayBuffer>>());
  /** Every read started and not finished, so a press can wait out all of them. */
  const reads = useRef(new Set<Promise<void>>());
  /* Dragging over a child fires leave on the parent, so the page would disarm
   * every time the cursor crossed a row. Counting enter against leave is what
   * makes "still over the page" a thing this can know. */
  const dragDepth = useRef(0);

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
    note.trim() !== "" ||
    files.length > 0 ||
    (pair !== null && pairIsFilled(pair));
  const canSend = hasSomething && !(seal !== null && seal.value === "");

  /**
   * What the envelope carries, or nothing at all because a file's bytes are not in
   * hand.
   *
   * Only ever asked once every read has settled, so a row with no bytes behind it is
   * a read that failed. Sealing the rest would be this quietly deciding which half
   * of a handover matters, which is the same thing a drop over a cap is refused for.
   */
  function sealable(): Draft | null {
    const attached = files.flatMap((one) => {
      const bytes = held.current.get(one.id);

      return bytes ? [{ bytes, name: one.name, type: one.type }] : [];
    });

    if (attached.length !== files.length) {
      return null;
    }

    return {
      ...(pair && {
        credentials: { password: pair.password, username: pair.username },
      }),
      ...(seal && { password: seal.value }),
      ...(attached.length > 0 && { files: attached }),
      expiry,
      note,
    };
  }

  async function crossing() {
    setProblem(null);
    setLocking(true);
    const startedAt = performance.now();

    try {
      /* A press can land while a file is still being read, because the row was drawn
       * before its bytes were in hand. It waits rather than sealing around a hole: an
       * envelope missing the file the sender watched themselves attach is the worst
       * thing this could do quietly. The dim is already on screen, so the wait costs
       * the sender nothing but time. Nothing can join the set while this waits,
       * because attaching is refused for the length of the lock. */
      await Promise.all([...reads.current]);

      const draft = sealable();
      if (!draft) {
        await restOfTheFloor(startedAt);
        setProblem("unreadable-file");
        return;
      }

      const made = await sealAndSend(draft);
      await restOfTheFloor(startedAt);

      setCopied(await toClipboard(made.href));
      setLink(made);
      setStage("sent");
    } catch (error) {
      await restOfTheFloor(startedAt);
      setProblem(problemOf(error));
      setLimit(limitOf(error));
      setRetryAfter(waitOf(error));
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

  /** One gesture's bytes, into hand, or the rows it drew back off the screen. */
  async function read(arriving: readonly { file: File; id: number }[]) {
    let bytes: { bytes: Uint8Array<ArrayBuffer>; id: number }[];

    try {
      bytes = await Promise.all(
        arriving.map(async ({ file, id }) => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          id,
        }))
      );
    } catch {
      /* A file moved or was deleted between the picker and this read. The gesture is
       * taken whole or not at all, so every row it drew leaves again. Nothing about
       * the file is worth carrying into the sentence: the name is the sender's
       * business and the browser will not say more than that it could not be read. */
      const drawn = new Set(arriving.map(({ id }) => id));

      setFiles((now) => now.filter((one) => !drawn.has(one.id)));
      setProblem("unreadable-file");
      return;
    }

    /* Before the state update, so a press that was waiting on this read finds the
     * bytes the instant it stops waiting rather than a render later. */
    for (const one of bytes) {
      held.current.set(one.id, one.bytes);
    }

    /* The row showed the weight the picker claimed. This is the weight of the bytes
     * in hand, which is the one the envelope will actually carry. */
    const landed = new Map(bytes.map((one) => [one.id, one.bytes.length]));

    setFiles((now) =>
      now.map((one) => {
        const weight = landed.get(one.id);

        return weight === undefined ? one : { ...one, size: weight };
      })
    );
  }

  /*
   * Attaching, which is where a file stops being a thing on a disk and becomes
   * bytes this browser is holding.
   *
   * A gesture is taken whole or not at all. Attaching four of five dropped files
   * and saying nothing about the fifth would be the product quietly deciding which
   * parts of a handover matter, so a drop that would pass a cap is refused with a
   * sentence and the envelope is left exactly as it was. That ruling happens before
   * a single row is drawn, which is what lets the rows be drawn early at all.
   *
   * The weight checked here is the files' own, not the whole secret's. The note
   * can add a quarter of a megabyte to that and sealAndSend is the authority on
   * the total, so a sender right on the line is caught there instead, by the same
   * sentence. This one is the early answer, not the ruling.
   */
  async function attach(chosen: ArrayLike<File>) {
    /*
     * Not while the envelope is being sealed. The dim says the parts are no longer
     * the sender's to edit, and this is the one way into the envelope that the dim
     * does not cover: the drop handlers are on the page rather than on the panel, so
     * a file dropped mid-lock reaches here whatever the panel looks like.
     *
     * Refused rather than queued, because the press has already decided what it is
     * sealing. A row that appeared after that decision and was not in the secret
     * would be the sender watching a file attach and then not arrive.
     *
     * `locking` is reliable here despite being state rather than a ref: it is set
     * inside the press, so React has flushed it before the browser hands anything
     * else an event to run this from.
     */
    if (locking) {
      return;
    }

    const picked = Array.from(chosen);
    if (picked.length === 0) {
      return;
    }

    const broken = overCap(
      files.length + picked.length,
      picked.reduce((sum, one) => sum + one.size, weightOf(files))
    );
    if (broken) {
      setProblem(broken.problem);
      setLimit(broken.limit);
      return;
    }

    const arriving = picked.map((file) => {
      const id = nextFile.current;
      nextFile.current += 1;

      return { file, id };
    });

    /* The rows land now, from what the picker already said about each file. Reading
     * is the slow half and it happens behind them. */
    setProblem(null);
    setFiles((now) => [
      ...now,
      ...arriving.map(({ file, id }) => ({
        id,
        name: file.name,
        open: true,
        size: file.size,
        type: file.type,
      })),
    ]);

    const reading = read(arriving);
    reads.current.add(reading);
    try {
      await reading;
    } finally {
      reads.current.delete(reading);
    }
  }

  /*
   * The whole page is the drop target, because a sender dragging a file at the
   * browser is aiming at the window rather than at a rectangle. What says where it
   * will land is the panel lighting up, which is armed, below.
   */
  const dragging = {
    onDragEnter(event: DragEvent<HTMLElement>) {
      if (carriesFiles(event)) {
        dragDepth.current += 1;
        setArmed(true);
      }
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!carriesFiles(event)) {
        return;
      }
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setArmed(false);
      }
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      // Without this the browser opens the file instead of handing it over.
      if (carriesFiles(event)) {
        event.preventDefault();
      }
    },
    async onDrop(event: DragEvent<HTMLElement>) {
      event.preventDefault();
      dragDepth.current = 0;
      setArmed(false);
      await attach(event.dataTransfer.files);
    },
  };

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
    affordances: {
      attachAtDesk,
      attachOnPhone,
      pairAtDesk,
      pairOnPhone,
      seal: sealAffordance,
    },
    armed,
    attach,
    canSend,
    copied,
    copyLink,
    dragging,
    expiry,
    fields: { picker, seal: sealField, username: usernameField },
    files,
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
    pickFiles() {
      picker.current?.click();
    },
    problem,
    removeFile(id) {
      edited();
      held.current.delete(id);
      setFiles((now) =>
        now.map((one) => (one.id === id ? { ...one, open: false } : one))
      );
      window.setTimeout(() => {
        setFiles((now) => now.filter((one) => one.id !== id));
        /* Back to the affordance the row came from. Both lanes are asked, and the
         * one whose affordance is not on screen cannot take focus. */
        attachAtDesk.current?.focus({ preventScroll: true });
        attachOnPhone.current?.focus({ preventScroll: true });
      }, SETTLE_MS);
    },
    removePair() {
      setPair((now) => (now ? { ...now, open: false } : now));
      window.setTimeout(() => setPair(null), SETTLE_MS);
    },
    removeSeal() {
      setSeal((now) => (now ? { ...now, open: false } : now));
      window.setTimeout(() => setSeal(null), SETTLE_MS);
    },
    retryAfter,
    seal,
    send,
    sendAnother() {
      held.current.clear();
      setStage("compose");
      setStarted(false);
      setCopied(false);
      setHandoff("idle");
      setProblem(null);
      setLink(null);
      setTyped("");
      setPair(null);
      setSeal(null);
      setFiles([]);
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
