import { cn } from "../lib/utils";

/*
 * The brand mark: the curved sweep, on a 32px grid and filled rather than
 * stroked, which is why it is here and not in the icon set. That set is one
 * 16px grid at one stroke weight, and dropping a filled 32px glyph into it
 * would put two drawing styles in one file.
 *
 * The path is the chosen study verbatim, tapers and all. Its three hairline
 * tips are the whole point of the drawing, so they are not blunted to survive
 * small sizes. `favicon.svg` carries the same path.
 */
export function Mark({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <path d="M3 4C12 8 22 9 29 4C27 11 25 14 22 14L17 14C17 19 18 23 11 29C13 21 8 11 3 4Z" />
    </svg>
  );
}

/*
 * The name, with the mark. Every surface in the product wears it from here
 * instead of each screen redrawing it a pixel off.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex select-none items-center gap-2 font-sans font-semibold text-[15px] text-ink tracking-[-0.01em]",
        className
      )}
    >
      <Mark className="text-accent" size={15} />
      SecureSend
    </span>
  );
}
