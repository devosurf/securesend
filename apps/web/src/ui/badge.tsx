import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

/*
 * The three states a secret can be in, and the only three.
 *
 *   live     teal    the link works
 *   expiring amber   time is running out, and time is the only thing amber says
 *   gone     neutral it has been used or it expired; nothing is left
 *
 * "gone" is grey rather than red on purpose. Nothing failed. The product did
 * exactly what it promised, so the end state should read as calm, not as error.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 font-medium font-sans text-[10.5px]",
  {
    defaultVariants: { state: "live" },
    variants: {
      state: {
        expiring: "border-warn/30 bg-warn/10 text-warn",
        gone: "border-hairline bg-surface-raised text-ink-faint",
        live: "border-accent/30 bg-accent/10 text-accent",
      },
    },
  }
);

export type BadgeState = "live" | "expiring" | "gone";

const dotClass: Record<BadgeState, string> = {
  expiring: "bg-warn",
  gone: "bg-ink-disabled",
  live: "bg-accent",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  Omit<VariantProps<typeof badgeVariants>, "state"> & {
    state?: BadgeState;
    dot?: boolean;
  };

export function Badge({
  className,
  state = "live",
  dot = true,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ state }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-[5px] w-[5px] rounded-full", dotClass[state])}
        />
      ) : null}
      {children}
    </span>
  );
}
