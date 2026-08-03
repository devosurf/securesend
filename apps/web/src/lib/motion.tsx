import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./utils";

/*
 * The in-place half of the motion vocabulary, as one component.
 *
 * transitions.css owns what the moves are: advance is a small step forward,
 * reveal is the one slow moment, burn is something leaving with nothing eager
 * replacing it. This file owns only the mechanism for playing them when the
 * change happens inside one screen rather than across a navigation.
 *
 * ---- why it exists -------------------------------------------------------
 *
 * The reveal, sealed to open, is the single most designed moment in this
 * product, and it happens inside one component: the recipient presses a button
 * and the same screen changes. Without this it would be an instant swap, and the
 * 520ms uncover would have been designed and then quietly dropped on the way to
 * being buildable.
 *
 * ---- the technique -------------------------------------------------------
 *
 * Both readings are mounted in one grid cell, so the cell is always as tall as
 * the taller of them and neither can move the other. The outgoing one plays its
 * leave, the incoming one plays its arrival, and the outgoing is dropped once
 * its animation is over.
 *
 * `enter={false}` for the state a screen loads in: it was already there, so it
 * has no arrival to explain. Same rule Collapse follows.
 */

export type Move = "advance" | "reveal" | "burn";

/* Long enough for the slowest half of each move to finish. reveal is 520ms of
 * uncover; burn is 260 of dissolve with the arrival delayed 120 behind it. */
const DURATION: Record<Move, number> = {
  advance: 320,
  burn: 380,
  reveal: 520,
};

const ENTER: Record<Move, string> = {
  advance: "ss-advance-in",
  burn: "ss-burn-in",
  reveal: "ss-reveal-in",
};

const LEAVE: Record<Move, string> = {
  advance: "ss-advance-out",
  burn: "ss-burn-out",
  reveal: "ss-burn-out",
};

/**
 * Plays one of the vocabulary's moves when `phase` changes.
 *
 * `move` is read at the moment of the change, so a screen can leave one state by
 * one move and another state by another: sealed to open is a reveal, sealed to
 * retry is a burn, and they are the same component.
 */
export function PhaseSwap({
  phase,
  move,
  enter = false,
  children,
  className,
}: {
  /** Changing this plays the move. */
  phase: string;
  /** Which move this particular change is. */
  move: Move;
  /** True only if the first paint should animate. */
  enter?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [current, setCurrent] = useState(() => ({
    first: true,
    move,
    node: children,
    phase,
  }));
  const [leaving, setLeaving] = useState<{
    phase: string;
    node: ReactNode;
    move: Move;
  } | null>(null);

  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (phase === current.phase) {
      /* Same state, new content: the children are live (a password being typed,
       * a try count going up) and must not restart an animation. */
      setCurrent((now) => ({ ...now, node: children }));
      return;
    }

    setLeaving({ move, node: current.node, phase: current.phase });
    setCurrent({ first: false, move, node: children, phase });

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), DURATION[move]);
    // `children` changes on every keystroke, so it runs this effect constantly.
    // Only the phase check above may start a move; every other run falls into
    // the early return and updates the live node in place.
  }, [phase, move, children, current.phase, current.node]);

  const animateCurrent = !current.first || enter;

  return (
    <div className={cn("grid", className)}>
      {leaving ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none col-start-1 row-start-1",
            LEAVE[leaving.move]
          )}
          key={leaving.phase}
        >
          {leaving.node}
        </div>
      ) : null}

      <div
        className={cn(
          "col-start-1 row-start-1",
          animateCurrent && ENTER[current.move]
        )}
        key={current.phase}
      >
        {current.node}
      </div>
    </div>
  );
}
