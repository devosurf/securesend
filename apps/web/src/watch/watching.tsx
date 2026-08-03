import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useRef,
  useState,
} from "react";
import { browserMemory, recall } from "../compose/remember";
import { useAtDesk } from "../lib/lane";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { StatusRow } from "../ui/status-row";
import { burnOne, statusesOf, type Watched } from "./statuses";

/*
 * What this device is watching, and the one question it asks before destroying
 * anything.
 *
 * It is a context rather than a component's own state because two screens need the same
 * answers. The homepage's memory panel lists everything this browser sent; the receipt
 * watches the one secret it just made. Both can ask for a burn, both have to be told
 * what became of it, and there is exactly one dialog between a stray press and a
 * destroyed secret, so the dialog lives here with the state it acts on.
 *
 * The management token never leaves this module. A row carries what a sender reads and
 * nothing they could act with: when a burn is confirmed, the token is looked up from
 * this browser's memory at that moment rather than carried around in a prop.
 */

export type Freshness = "load" | "checking" | "fresh";

/** Which of the three shapes the homepage's memory element takes. */
export type Memory = "full" | "forgotten" | "none";

export interface Watching {
  /** The row being asked about, restated inside the dialog. */
  asking: Watched | null;
  askToBurn: (target: Watched) => void;
  confirmBurn: () => Promise<void>;
  freshness: Freshness;
  keep: () => void;
  memory: Memory;
  /** The same, with the freshness line saying so while it happens. */
  recheck: () => Promise<void>;
  /** Re-reads this browser's memory and asks the instance about all of it. */
  refresh: () => Promise<void>;
  rows: Watched[];
  /** What the instance last said about one id, for a screen watching just one. */
  statusOf: (id: string) => Watched | null;
  /** A burn that did not go through. Nothing was destroyed. */
  trouble: boolean;
}

const WatchContext = createContext<Watching | null>(null);

export function useWatching(): Watching {
  const watching = use(WatchContext);
  if (!watching) {
    throw new Error("this belongs inside WatchProvider");
  }
  return watching;
}

/*
 * Nothing until the instance has answered, which is what makes "none" honest.
 *
 * A device that remembers ids knows their ids and their expiries, so it could paint a
 * list from its own memory before asking. It must not: the line under the panel says
 * these statuses were checked, and a locally guessed "Sealed" that flips to "Used" a
 * moment later would make that line a lie for the length of one request.
 *
 * Past that, `full` is a list with news in it and `forgotten` is a list without. Nothing
 * sealed means nothing can be burned and nothing can change, so there is no summary to
 * collapse behind a control and nothing to re-check.
 */
function memoryOf(rows: Watched[]): Memory {
  if (rows.length === 0) {
    return "none";
  }

  return rows.some((row) => row.status === "sealed") ? "full" : "forgotten";
}

export function WatchProvider({ children }: { children: ReactNode }) {
  const atDesk = useAtDesk();

  const [rows, setRows] = useState<Watched[]>([]);
  const [freshness, setFreshness] = useState<Freshness>("load");
  const [asking, setAsking] = useState<Watched | null>(null);
  const [open, setOpen] = useState(false);
  const [trouble, setTrouble] = useState(false);

  const keepIt = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    const kept = browserMemory();

    setRows(kept ? await statusesOf(recall(kept)) : []);
  }, []);

  const recheck = useCallback(async () => {
    setFreshness("checking");
    await refresh();
    setFreshness("fresh");
  }, [refresh]);

  /* One row in, replacing what was there or joining the front. The receipt's own secret
   * is not in the list until something asks about it, so a burn from there adds it. */
  function record(watched: Watched) {
    setRows((now) =>
      now.some((row) => row.id === watched.id)
        ? now.map((row) => (row.id === watched.id ? watched : row))
        : [watched, ...now]
    );
  }

  async function confirmBurn() {
    const target = asking;
    setOpen(false);
    setTrouble(false);

    if (!target) {
      return;
    }

    const kept = browserMemory();
    const held = kept
      ? recall(kept).find((secret) => secret.id === target.id)
      : undefined;

    /* No token, so no authority. This is what a browser looks like after its site data
     * was cleared in another tab, and the honest answer is that nothing happened. */
    if (!held) {
      setTrouble(true);
      return;
    }

    const burned = await burnOne(held);

    if (burned.status === "answered") {
      record(burned.watched);
      return;
    }
    if (burned.status === "forgotten") {
      setRows((now) => now.filter((row) => row.id !== target.id));
      return;
    }

    setTrouble(true);
  }

  const watching: Watching = {
    asking,
    askToBurn(target) {
      setAsking(target);
      setTrouble(false);
      setOpen(true);
    },
    confirmBurn,
    freshness,
    keep() {
      setOpen(false);
    },
    memory: memoryOf(rows),
    recheck,
    refresh,
    rows,
    statusOf(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    trouble,
  };

  return (
    <WatchContext value={watching}>
      {children}

      {/*
       * The one floating surface v0 allows itself.
       *
       * The row is restated inside the question because the scrim hides the list, and
       * the list is the only thing that makes six characters of slug mean anything: a
       * destroy confirmed against remembered context is a destroy confirmed blind.
       *
       * Keep it is the primary and holds initial focus. There is no red in this system,
       * and teal on the destroy would be worse than quiet, because teal is what this
       * product uses for live. Escape means keep. A scrim click means nothing at all:
       * this dialog exists because the sender has to say which of two things they meant,
       * and a stray click is not an answer.
       *
       * Docked to the bottom edge on a phone, because a centred layer puts these two
       * buttons in the middle of the screen where a thumb reaches neither, and they are
       * the two most consequential buttons in the product.
       */}
      <Dialog
        describedBy="burn-body"
        initialFocus={keepIt}
        labelledBy="burn-title"
        onDismiss={watching.keep}
        open={open}
        placement={atDesk ? "center" : "sheet"}
      >
        <div className="p-6">
          <h2
            className="font-sans text-heading text-ink-strong"
            id="burn-title"
          >
            Burn this secret now?
          </h2>

          {asking ? (
            <div className="mt-5 rounded-inner bg-surface-sunken px-4 py-3">
              <StatusRow
                className="px-0 py-0"
                id={asking.shown}
                layout="stacked"
                status={asking.status}
                timing={asking.timing}
              />
            </div>
          ) : null}

          <p className="mt-5 font-sans text-body text-ink-muted" id="burn-body">
            The contents are destroyed immediately and cannot be recovered.
            Anyone who opens the link will be told you burned it.
          </p>

          <div className="mt-7 flex items-center justify-end gap-2">
            <Button onClick={confirmBurn} variant="secondary">
              Burn it
            </Button>
            <Button onClick={watching.keep} ref={keepIt}>
              Keep it
            </Button>
          </div>
        </div>
      </Dialog>
    </WatchContext>
  );
}
