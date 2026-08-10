import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { SwapLabel } from "./swap-row";

/*
 * The control that gets a whole secret out of the page before the page stops
 * being a place the secret lives.
 *
 * A secret is strictly one time: opening the link deletes it. So the recipient has
 * exactly one window to take the contents somewhere they own, and the cost of
 * missing that window is a message to the sender and a second link. This is the two
 * second version of that window.
 *
 * It is controlled rather than self-latching, unlike CopyRow. A per field copy is a
 * small confirmation that can flash and forget; taking everything is the thing the
 * recipient will later ask themselves whether they actually did, so the done state
 * has to persist, and it has to be the screen that decides it, because the screen
 * is where the clipboard write or the download actually happens. Shared UI takes
 * props, never knowledge.
 *
 * Busy is here because packaging a download is not instant and a button that looks
 * idle for half a second reads as a button that did not take the press.
 *
 * Every label it can carry is measured, not just the one it is carrying. Taken is
 * half the width of Take everything, and this button sits at one end of a row that
 * lays itself out around it, so a plain swap would move the sentence beside it at
 * the exact moment the recipient is reading that sentence to find out whether the
 * press worked. See SwapLabel.
 */

export interface TakeButtonProps {
  busy?: boolean;
  busyLabel?: string;
  className?: string;
  done?: boolean;
  doneLabel: string;
  icon: IconName;
  label: string;
  onTake?: () => void;
  /** touch is the phone: the same control, thumb-sized, usually full width. */
  size?: "sm" | "md" | "touch";
  variant?: "primary" | "secondary" | "ghost";
}

const ICON_SIZE: Record<"sm" | "md" | "touch", number> = {
  md: 15,
  sm: 14,
  touch: 16,
};

export function TakeButton({
  label,
  doneLabel,
  busyLabel,
  icon,
  done = false,
  busy = false,
  onTake,
  variant = "primary",
  size = "md",
  className,
}: TakeButtonProps) {
  function text() {
    if (busy) {
      return busyLabel ?? label;
    }
    return done ? doneLabel : label;
  }

  /* A Set because a caller is free to give the same word twice: a busy label that
   * repeats the resting one is one reading, not two cells. */
  const readings = [...new Set([label, doneLabel, busyLabel ?? label])];

  return (
    <Button
      busy={busy}
      className={cn(
        "gap-2",
        /* On a ghost or a line, done reads in the accent. On a filled accent it
         * already reads, and tinting it again would only make the type fight its
         * own ground. */
        done && variant !== "primary" && "text-accent hover:text-accent",
        className
      )}
      onClick={onTake}
      size={size}
      variant={variant}
    >
      <Icon name={done && !busy ? "check" : icon} size={ICON_SIZE[size]} />
      <SwapLabel readings={readings} said={text()} />
    </Button>
  );
}
