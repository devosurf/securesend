import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/utils";

/*
 * Primary is a solid accent fill with near-black text. Never white on teal.
 * Secondary is a raised surface with a line. Ghost is text until you touch it.
 *
 * Disabled is deliberately a filled grey rather than a faded primary: an
 * outlined or ghosted resting state reads as disabled, so a disabled state that
 * looks like one has nowhere left to go.
 *
 * Press is 1.5% of scale for the length of the press. It is the one piece of
 * motion every control in the product shares, and it exists to answer "did that
 * land", which on a page where the next thing is a navigation is a real
 * question. Any more travel and it reads as a toy.
 *
 * Four sizes, because a finger is not a cursor. `sm` and `md` are the pointer
 * sizes. `tap` and `touch` are the same two controls given a real hit area on a
 * phone, and they grow by padding only: the type barely moves, so a touch
 * surface stays as quiet and dense as the desk one and never turns into the fat,
 * rounded mobile UI this product is trying not to be. `tap` is the inline action
 * inside a row (Copy, Show, Save); `touch` is the full-width primary a thumb
 * goes looking for.
 */
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-sans font-semibold transition-[color,background-color,border-color,transform] duration-[var(--duration-instant)] ease-[var(--ease-out-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100 motion-reduce:active:scale-100",
  {
    defaultVariants: { size: "md", variant: "primary" },
    variants: {
      size: {
        md: "px-5 py-2.5 text-[13.5px]",
        sm: "px-3 py-1.5 text-[11.5px]",
        tap: "px-3.5 py-[15px] text-[12px]",
        touch: "px-5 py-4 text-[14.5px]",
      },
      variant: {
        ghost:
          "text-ink-muted hover:bg-surface-raised hover:text-ink disabled:text-ink-disabled disabled:hover:bg-transparent",
        primary:
          "bg-accent text-accent-ink hover:bg-accent-hover disabled:bg-surface-raised disabled:text-ink-disabled",
        secondary:
          "border border-line-strong bg-surface-raised text-ink hover:border-ink-faint disabled:border-hairline disabled:text-ink-disabled",
      },
    },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /* Working, not unavailable. A busy button keeps its fill, because the thing
     * it started is still the thing happening; it only stops taking input.
     * Greying it out would say the action was withdrawn. */
    busy?: boolean | undefined;
    /* So a surface that adds and removes its own parts can put focus back on the
     * affordance a removed part came from. */
    ref?: Ref<HTMLButtonElement> | undefined;
  };

export function Button({
  className,
  variant,
  size,
  busy = false,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={busy || undefined}
      className={cn(
        buttonVariants({ size, variant }),
        busy && "pointer-events-none cursor-wait",
        className
      )}
      ref={ref}
      type="button"
      {...props}
    />
  );
}
