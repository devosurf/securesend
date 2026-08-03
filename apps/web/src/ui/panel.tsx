import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/*
 * The bordered surface the create flow lives in.
 *
 * It is a primitive because removing it was tested and failed: with no panel the
 * textarea stops reading as an input entirely. The panel is what makes empty
 * space legible as room to type.
 *
 * `focused` is passed in rather than tracked here, because the thing that owns
 * the focus is the field inside it, and shared UI takes props, never knowledge.
 *
 * `armed` is the panel as a drop target while a file is over it. It borrows the
 * focus treatment on purpose and does not invent a third border colour: focused
 * and armed mean nearly the same thing, "what you do next lands here", and the
 * product should not have two visual languages for that. What separates them is
 * inside the panel, not on its edge: armed also tints the region the file will
 * actually land in. Armed outranks focused, because a drag is the more immediate
 * claim on the surface.
 */
export function Panel({
  children,
  focused = false,
  armed = false,
  className,
}: {
  children: ReactNode;
  focused?: boolean;
  armed?: boolean;
  className?: string;
}) {
  const live = armed || focused;

  return (
    <div
      className={cn(
        "rounded-control border bg-surface transition-colors duration-[var(--duration-quick)]",
        armed && "border-accent",
        !armed && focused && "border-accent/70",
        !live && "border-hairline",
        live && "[box-shadow:var(--ring-accent)]",
        className
      )}
    >
      {children}
    </div>
  );
}
