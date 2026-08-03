import { cn } from "../lib/utils";

/*
 * The name, with the one teal dot. Every surface in the product wears it from
 * here instead of each screen redrawing it a pixel off.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex select-none items-center gap-2 font-sans font-semibold text-[15px] text-ink tracking-[-0.01em]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-[7px] rounded-full bg-accent"
      />
      SecureSend
    </span>
  );
}
