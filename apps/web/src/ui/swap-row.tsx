import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/*
 * One strip that says two things, in space reserved for both.
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
