import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../lib/utils";

/*
 * The one way a part arrives in, or leaves, a surface that is already on screen.
 * Everything the envelope grows by uses this, so growing never invents a second
 * grammar.
 *
 * The move is a slot opening: a grid track goes 0fr to 1fr while the content
 * inside is clipped, so the surface makes room and the part lands in it. It is
 * not a slide, because a slide would say the part came from somewhere else. It
 * came from nowhere; the surface got taller.
 *
 * Arriving and leaving are the same move in opposite directions, never two
 * inventions:
 *
 *   arrive   the slot opens (settle, ease-out-quick), the content fades up once
 *            the room is mostly made (quick, 60ms behind)
 *   leave    the content fades out first (instant), then the slot closes
 *            (settle, ease-in-out-soft)
 *
 * `axis` is why this is one primitive and not two. An affordance that spends
 * itself collapses horizontally; a row that is added opens vertically. Same
 * duration, same idea, so a click that does both at once reads as one event.
 *
 * Children stay mounted through the exit so the fade has something to fade, and
 * go `invisible` once the slot is shut, which takes them out of the tab order.
 * The caller unmounts on its own clock: SETTLE_MS.
 */

/** `--duration-settle` in milliseconds, for callers timing an unmount. */
export const SETTLE_MS = 260;

export function Collapse({
  open,
  axis = "block",
  enter = true,
  children,
  className,
}: {
  open: boolean;
  /** block opens downward (a row), inline closes sideways (a spent affordance). */
  axis?: "block" | "inline";
  /** False for something that was already there when the screen loaded: it has
   * no arrival to explain, so it must not play one. */
  enter?: boolean;
  children: ReactNode;
  className?: string;
}) {
  // First paint is the closed track, so an element mounted open still animates
  // its arrival. Two frames, because one can land inside the same commit.
  const [entered, setEntered] = useState(!enter);
  const [settled, setSettled] = useState(open);

  useEffect(() => {
    if (!enter) {
      return () => undefined;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [enter]);

  useEffect(() => {
    if (open) {
      setSettled(true);
      return () => undefined;
    }
    const timer = setTimeout(() => setSettled(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const shown = entered && open;
  const block = axis === "block";

  return (
    <div
      className={cn(
        "grid duration-[var(--duration-settle)] motion-reduce:transition-none",
        block
          ? "transition-[grid-template-rows]"
          : "transition-[grid-template-columns]",
        shown
          ? "ease-[var(--ease-out-quick)]"
          : "ease-[var(--ease-in-out-soft)]",
        block && (shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"),
        !block && (shown ? "grid-cols-[1fr]" : "grid-cols-[0fr]"),
        className
      )}
    >
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-hidden transition-opacity motion-reduce:transition-none",
          shown
            ? "opacity-100 delay-[60ms] duration-[var(--duration-quick)]"
            : "opacity-0 duration-[var(--duration-instant)]",
          !(open || settled) && "invisible"
        )}
      >
        {children}
      </div>
    </div>
  );
}
