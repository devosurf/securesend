import { useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Icon } from "./icon";
import { Menu, type MenuOption } from "./menu";

/*
 * The one setting that rides with every envelope, in the one shape it takes.
 *
 * Three fixed values: no custom input, no seven-day option, one rule for every
 * envelope regardless of what is in it.
 *
 * The trigger says the whole sentence, and that is the reason to prefer a menu
 * here over a segmented strip. The strip read `expires in` in mono meta beside
 * three bare durations, which is the machine voice on the page whose whole job is
 * to sound like a person. `expires in 24 hours` is one phrase in sans that a
 * sender reads rather than parses, and it is only sayable because a menu has
 * somewhere to put the options that a strip does not.
 *
 * The trigger reserves the width of its longest value. Picking 1 hour must not
 * pull "Ask for a password" leftward under a cursor that is aiming at it: that is
 * the bug SwapRow exists to prevent. A menu can reserve it honestly, because the
 * reserve is the width of one phrase rather than of three options laid side by
 * side, which is also why this is narrower at rest than a strip.
 *
 * The chosen value is still the screen's: this takes it as a prop and hands
 * changes back, so nothing about which envelope is being made leaks into shared
 * UI.
 */

/* Said in full, because a menu has room to say it in full. "1h / 24h / 72h" was
 * an abbreviation forced by three options standing side by side. */
export const EXPIRY_OPTIONS: MenuOption[] = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "72 hours", value: "72h" },
];

function spoken(value: string) {
  return (
    EXPIRY_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

export function ExpiryPicker({
  value,
  onChange,
  density = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  density?: "default" | "touch";
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const touch = density === "touch";

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          /* min-w is the natural width at "24 hours", the longest of the three, so
           * the control never changes size and never moves the affordance beside
           * it. The reserve is trailing space and the chevron stays against the
           * text: a chevron parked at a far right edge reads as a gap, and it is
           * the phrase it belongs to, not the box. Only "1 hour" leaves any slack,
           * and it leaves it after the chevron where nothing is looking. */
          "flex items-center gap-1.5 rounded-control font-medium font-sans text-ink-muted transition-colors duration-[var(--duration-instant)] hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
          touch
            ? "min-w-[146px] px-3 py-[13px] text-[12px]"
            : "min-w-[134px] px-2.5 py-1.5 text-[11.5px]"
        )}
        onClick={() => setOpen((was) => !was)}
        ref={triggerRef}
        type="button"
      >
        <span className="whitespace-nowrap">expires in {spoken(value)}</span>
        <Icon
          className={cn(
            "shrink-0 transition-transform duration-[var(--duration-instant)] motion-reduce:transition-none",
            open && "-rotate-180"
          )}
          name="chevron-down"
          size={11}
        />
      </button>

      <Menu
        density={density}
        label="Link expires in"
        onChange={onChange}
        onClose={() => setOpen(false)}
        open={open}
        options={EXPIRY_OPTIONS}
        triggerRef={triggerRef}
        value={value}
      />
    </div>
  );
}
