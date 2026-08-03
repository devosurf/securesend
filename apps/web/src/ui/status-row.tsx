import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Badge, type BadgeState } from "./badge";
import { Button } from "./button";
import { Collapse, SETTLE_MS } from "./collapse";

/*
 * One secret this browser remembers, on one line.
 *
 * The sender's twin of CopyRow: same padding, same mono meta labels, same grammar,
 * so the list of what you have sent reads as the same product as the envelope you
 * sent it from. What makes it a different component is that every part of it is
 * deliberately something you cannot act on.
 *
 * ---- what is on the row, and what is not --------------------------------
 *
 * The management token this row is built on is unrelated to the encryption key, so
 * this device physically cannot rebuild the link. What it can show is the half
 * without the key. That is why there is no copy button here and no resend: there is
 * nothing complete to copy, and a Copy that handed over a link that cannot decrypt
 * would be the worst possible lie for this product to tell. The row exists to be
 * *matched* against the message you sent, and matching is reading, not clicking.
 *
 * So the id is tone-split at its last slash: every row on a device shares
 * `securesend.dev/s/`, and the only characters that tell one row from another are
 * the ones after it. Dimming the shared stem is what makes five anonymous rows
 * scannable, and it says the same thing LinkSpecimen's anatomy tone says on the
 * reveal side, with the same tokens: the part that matters is the part in full ink.
 *
 * There is no hover highlight, because the row is not a link and must not offer
 * itself as one.
 *
 * ---- the four states -----------------------------------------------------
 *
 * Sealed is live and teal. Used and burned are gone and neutral, because nothing
 * failed: the product did exactly what it promised. Expired is amber, and amber is
 * time and only time. Nothing here is ever red.
 *
 * `Used` is deliberately not `Opened`. The server watches a reveal get pressed and
 * the ciphertext go out; it never learns whether anyone could read what came back,
 * because a wrong password spends the link anyway and a phone can kill the tab
 * mid-reveal. On the recipient's screen that gap costs a little drama. Here it
 * costs more, because the sender is the one who *acts* on the answer: told
 * "opened", they believe the handover landed and stop chasing it.
 *
 * The word is `Used` rather than `Spent` for a reason only the render showed.
 * `Spent` and `Sealed` land on adjacent rows sharing a capital S and most of their
 * silhouette, so the two states that must never be confused became the likest pair
 * in a column of near-identical rows. `Used` separates from `Sealed` before you
 * have finished reading it. It costs the ledger some volume, and that is the trade
 * taken knowingly.
 *
 * `Opened` is not banned from the product, only from this column. It is honest
 * wherever a client witnessed the decryption, and in prose that states the
 * negative, which the server can always back: nobody pressing a reveal is a thing
 * it genuinely knows.
 *
 * ---- the burn asks somewhere else ----------------------------------------
 *
 * The row carries the affordance and not the question. Burning is irreversible and
 * one click away from a list of near-identical rows, so it is confirmed in the one
 * floating surface this product allows itself: a modal, with focus starting on the
 * safe choice, Escape meaning keep, and a scrim click meaning nothing at all. An
 * inline two-step lived here first and was measured to fit, but it could not buy
 * any of that keyboard safety.
 *
 * The objection it was built to answer is real and is answered elsewhere: a scrim
 * hides the other rows, and the other rows are the only context that makes a few
 * characters of slug mean anything. So the dialog restates the row it is about, the
 * same id and the same clock, because a destroy you confirm against remembered
 * context is a destroy confirmed blind.
 *
 * Resting and only state: a ghost `Burn it now` that asks the screen. The row never
 * destroys anything itself.
 *
 * ---- the burn's own motion ----------------------------------------------
 *
 * A confirmed burn is the interface-scale echo of the `burn` walk in
 * transitions.css, down to the numbers: the sealed status dissolves out over
 * --duration-settle on --ease-in-out-soft with a 2px blur, and the tombstone fades
 * in 120ms behind it. Nothing eager replaces what just went. The two layers share
 * one grid cell so the line cannot change height while it happens, and the id sits
 * outside the crossfade, because the id did not die, because the tombstone keeps
 * it.
 *
 * The control leaves on its own move, not the crossfade's: it is an affordance that
 * has spent itself, exactly like the credential affordance on the create surface, so
 * it collapses on the same 260ms: sideways on the desk, and closing its own line on
 * the phone. That is also what keeps the list honest. A crossfade that unmounted the
 * control when it finished would drop 46px out of a stacked row a beat after the
 * press, and every row below it would snap up. Collapsing the slot makes the height
 * change part of the same event instead of an aftershock.
 *
 * The crossfade is driven from the status prop, because the moment it belongs to
 * happens in the dialog rather than in this row: the screen flips the secret and the
 * row plays what that change looks like. Shared UI takes props, never knowledge, and
 * this is the shape of that rule when the decision has moved off the component
 * making the picture.
 */

export type SecretStatus = "sealed" | "used" | "burned" | "expired";

const PRESENTATION: Record<SecretStatus, { label: string; state: BadgeState }> =
  {
    burned: { label: "Burned", state: "gone" },
    expired: { label: "Expired", state: "expiring" },
    sealed: { label: "Sealed", state: "live" },
    used: { label: "Used", state: "gone" },
  };

/** The status a row was showing at the instant a burn was confirmed. */
interface Phase {
  status: SecretStatus;
  timing: string;
}

/* Long enough for the dissolve and the tombstone arriving 120ms behind it, plus a
 * beat, so the layers are dropped after the move rather than during it. */
const BURN_MS = SETTLE_MS + 200;

export interface StatusRowProps {
  className?: string | undefined;
  /** Touch gives the burn controls a finger-sized target at the same weight. */
  density?: "default" | "touch";
  /** The link without its key: `securesend.dev/s/7hK2mQ`. Never copyable. */
  id: string;
  /** Stacked is the phone: the id, the status and the action get a line each. */
  layout?: "row" | "stacked";
  /** Present only while the secret is still there to burn. Asks; never acts. */
  onRequestBurn?: (() => void) | undefined;
  status: SecretStatus;
  /** The one time fact beside the badge: "21 hours left", "by you, just now". */
  timing: string;
}

export function StatusRow({
  id,
  status,
  timing,
  onRequestBurn,
  layout = "row",
  density = "default",
  className,
}: StatusRowProps) {
  const [ghost, setGhost] = useState<Phase | null>(null);
  const [settled, setSettled] = useState(true);
  const frame = useRef(0);
  const timer = useRef(0);
  const previous = useRef<Phase>({ status, timing });

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(timer.current);
    },
    []
  );

  useEffect(() => {
    const was = previous.current;
    previous.current = { status, timing };
    // Only a secret dying in front of the sender is worth a move. A row that
    // arrives already dead has nothing to explain, and neither does a timestamp
    // ticking over under an unchanged status.
    if (was.status === status || was.status !== "sealed") {
      return () => undefined;
    }

    // The outgoing status is the one the sender was looking at when they answered
    // the dialog, so that is the layer that dissolves.
    setGhost(was);
    setSettled(false);

    // First paint holds the outgoing layer at full strength, so the dissolve has
    // somewhere to start. Two frames, because one can land in this commit.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => setSettled(true));
    });

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setGhost(null);
      setSettled(true);
    }, BURN_MS);

    return () => undefined;
  }, [status, timing]);

  const touch = density === "touch";
  const stacked = layout === "stacked";
  const size = touch ? "tap" : "sm";
  const burnable = status === "sealed";

  const cut = id.lastIndexOf("/") + 1;

  const idText = (
    <span
      className={cn(
        "block truncate font-mono tracking-tight",
        touch ? "text-[13.5px]" : "text-[13px]"
      )}
    >
      <span className="text-ink-faint">{id.slice(0, cut)}</span>
      <span className="text-ink">{id.slice(cut)}</span>
    </span>
  );

  function statusOf(phase: Phase): ReactNode {
    const shape = PRESENTATION[phase.status];
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Badge state={shape.state}>{shape.label}</Badge>
        <span className="truncate font-mono text-ink-faint text-meta">
          {phase.timing}
        </span>
      </div>
    );
  }

  /* The burn crossfade, over the status and nothing else. Both layers share one
   * grid cell, so the line cannot change height while the sealed state leaves and
   * the tombstone arrives behind it. The id sits outside it, because the id did not
   * die: the tombstone keeps it. */
  const state = (
    <div className="grid">
      {ghost ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none col-start-1 row-start-1 transition-[opacity,filter] duration-[var(--duration-settle)] ease-[var(--ease-in-out-soft)] motion-reduce:transition-none",
            settled ? "opacity-0 blur-[2px]" : "opacity-100 blur-0"
          )}
        >
          {statusOf(ghost)}
        </div>
      ) : null}
      <div
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-[var(--duration-settle)] ease-[var(--ease-in-out-soft)] motion-reduce:transition-none",
          ghost && "delay-[120ms]",
          ghost && !settled ? "opacity-0" : "opacity-100"
        )}
      >
        {statusOf({ status, timing })}
      </div>
    </div>
  );

  /* One control, and it only asks. The question, and every guard around it, belongs
   * to the dialog the screen opens. */
  const action = onRequestBurn ? (
    <div className={cn("flex shrink-0 justify-end", touch && "-my-2")}>
      <Button
        className="whitespace-nowrap"
        onClick={onRequestBurn}
        size={size}
        variant="ghost"
      >
        Burn it now
      </Button>
    </div>
  ) : null;

  if (stacked) {
    return (
      <div className={cn("px-4 py-3", className)}>
        {idText}
        <div className="mt-2">{state}</div>
        {/* enter={false}: on a list that loads with the secret still sealed, the
         * control was always there and has no arrival to explain. It does have a
         * leaving: the slot closes as the tombstone settles in, so the rows below
         * never snap up a beat after the burn. */}
        {action ? (
          <Collapse enter={false} open={burnable}>
            <div className={cn("mt-1.5 flex justify-end", touch && "-mr-3.5")}>
              {action}
            </div>
          </Collapse>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        /* The id column takes exactly what an id needs rather than a fixed width.
         * Every row on a device shares one host and every secret id is the same 22
         * characters, so `auto` lines the rows up as precisely as a measured column
         * would, and unlike a measured one it cannot cut the tail off. Truncating here
         * would be the worst possible truncation: the characters after the last slash
         * are the only thing telling one row from another. */
        "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-4 py-2",
        className
      )}
    >
      {idText}
      <div className="flex min-h-7 items-center justify-between gap-4">
        {state}
        {/* The affordance spends itself, sideways, on the same 260ms as everything
         * else in this product that leaves in place. */}
        {action ? (
          <Collapse axis="inline" enter={false} open={burnable}>
            {action}
          </Collapse>
        ) : null}
      </div>
    </div>
  );
}
