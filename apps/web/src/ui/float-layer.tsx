import type { HTMLAttributes, Ref } from "react";
import { cn } from "../lib/utils";

/*
 * The one surface in the product that is not sitting on the page.
 *
 * Everything that floats goes through here: the confirmation dialog, the
 * anchored menu, the phone sheet. There is exactly one implementation, so "what
 * does elevation look like" has exactly one answer, and that answer is four
 * variables in tokens.css rather than a decision each component makes for
 * itself. Change the tokens and every floating thing changes with them.
 *
 * No drop shadow, ever. --float-ring is a box-shadow with no blur and no offset,
 * which is a ring: the same construct --ring-accent already uses for focus, run
 * in near-black instead of teal. A ring says "this edge is an edge"; a shadow
 * says "this object is hovering in a room with a light in it", and this product
 * has no rooms and no lights.
 *
 * The arrival is a 4px rise and a fade on settle. It is deliberately small: the
 * layer did not travel from anywhere, it just became true. Nothing here uses the
 * reveal transition, which belongs to the one moment a secret is uncovered and
 * would be cheapened by a menu spending it.
 */
export type FloatLayerProps = HTMLAttributes<HTMLDivElement> & {
  /** False on the first paint, true a frame later, so the arrival plays. */
  shown: boolean;
  ref?: Ref<HTMLDivElement> | undefined;
};

export function FloatLayer({
  shown,
  className,
  ref,
  ...props
}: FloatLayerProps) {
  return (
    <div
      className={cn(
        "rounded-control border transition-[opacity,transform] duration-[var(--duration-settle)] ease-[var(--ease-out-quick)] motion-reduce:transition-none",
        "[background:var(--float-surface)] [border-color:var(--float-border)] [box-shadow:var(--float-ring)]",
        shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        className
      )}
      ref={ref}
      {...props}
    />
  );
}
