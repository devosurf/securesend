import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/*
 * Something that says more than one thing, in space reserved for all of them.
 *
 * Two scales, one idea, the way transitions.css has two scales of one vocabulary.
 * SwapRow is the strip. SwapLabel is the word on a control. Both exist because a
 * surface that changes what it says must not change what it measures.
 *
 * The create panel's affordance row has to become a drop prompt the moment a file
 * is dragged over the surface. If that prompt were inserted, the panel would grow
 * under the cursor mid-drag, which is the worst possible time for a layout to
 * move. So both messages live in the same grid cell: the row is always as tall as
 * the taller of them, and the swap costs no height.
 *
 * The swap itself is a plain instant crossfade. It is a change of mind, not an
 * arrival, so it does not get the settle duration.
 */
export function SwapRow({
  showAlternate,
  primary,
  alternate,
  className,
}: {
  showAlternate: boolean;
  primary: ReactNode;
  alternate: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid", className)}>
      <div
        aria-hidden={showAlternate}
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-[var(--duration-instant)] motion-reduce:transition-none",
          showAlternate ? "pointer-events-none opacity-0" : "opacity-100"
        )}
      >
        {primary}
      </div>
      <div
        aria-hidden={!showAlternate}
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-[var(--duration-instant)] motion-reduce:transition-none",
          showAlternate ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        {alternate}
      </div>
    </div>
  );
}

/*
 * The same reservation, at the width of one word.
 *
 * A control that reports what it just did changes its own label, and labels are not
 * the same width: Copy becomes Copied, Create link becomes Locking…, Take
 * everything becomes Taken. Left alone, the control resizes under the cursor still
 * resting on it, and in a row that lays itself out around the control every
 * neighbour moves too. That is the bug SwapRow exists to prevent, met one scale
 * down, on the press the sender is watching hardest.
 *
 * ExpiryPicker answers the same problem by reserving the width of its longest value
 * in a min-width, and it can, because that label is left-aligned and the reserve is
 * trailing space nothing is looking at. A centred label cannot: the reserve would
 * open on both sides and the word would drift as it changed.
 *
 * So every reading is mounted in one cell, as SwapRow mounts two. The cell is as
 * wide as the longest of them, the word changes inside it, and nothing moves. The
 * readings not being said are hidden rather than faded, because a word is a state
 * being reported and not a thing arriving, and `visibility` is what keeps the room
 * while taking them out of the tab order and out of the control's accessible name.
 */
export function SwapLabel({
  readings,
  said,
}: {
  /** Every label this control can carry. The cell reserves the widest. */
  readings: readonly string[];
  /** The one it carries now, which has to be one of the readings. */
  said: string;
}) {
  return (
    <span className="grid">
      {readings.map((reading) => (
        <span
          aria-hidden={reading !== said}
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap",
            reading === said ? "visible" : "invisible"
          )}
          key={reading}
        >
          {reading}
        </span>
      ))}
    </span>
  );
}
