import type { ReactNode, Ref } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Collapse } from "./collapse";
import { Icon } from "./icon";

/*
 * The strip along the bottom of the create surface: how the envelope is sealed
 * and sent, plus the action that sends it.
 *
 * One setting, and only one, plus the seal. Strict one-time is the only mode, so a
 * "burn after reading" toggle would have nothing to switch to, and a toggle whose
 * off state does not exist is the create surface lying about the one promise the
 * whole product is built on. What is here instead is the setting that genuinely
 * has two states: whether the envelope also asks for a password before it opens.
 *
 * The password affordance spends itself, exactly like the credentials affordance
 * on the create surface: click it and it collapses sideways on the same 260ms
 * while the row it made opens above. There is never a second password, so the
 * button has nothing left to offer once one exists, and the row's own remove
 * control is what brings it back.
 *
 * Why the affordance is here and the field is not: the letter's contents grow
 * downward from the top of the panel, and the seal grows upward from the bottom. A
 * password is not part of what the recipient receives, it is what the envelope is
 * locked with, so it belongs on this ground rather than on the same lines as the
 * note and the login.
 *
 * The action arrives as a node so the screen keeps its own navigation, and it is
 * optional, because on a phone the action is not here. There the thing that sends
 * the secret is pinned in the bar where a thumb rests, and this strip keeps only
 * the settings that ride along with it.
 *
 * `quiet` is the settings going non-negotiable once the secret is being locked. It
 * dims and stops taking input, but the action beside it stays at full strength,
 * because that is the part that is still working.
 *
 * `density="touch"` gives both settings a finger-sized target without giving them
 * any more voice: padding grows, type does not, and a negative margin keeps the
 * strip at the height it has on a desk.
 *
 * At touch the two settings also stack, and that is a width fact rather than a
 * taste one. The password affordance is about 180px and the envelope is 350 wide
 * at 390, so a wide expiry control beside it overflows the panel and clips the
 * affordance's own label to "Ask for a pass". They stack rather than the label
 * shortening, because the strip is the one place a sender is told a password is
 * even possible, and an abbreviated control is a control that looks broken.
 *
 * The expiry control arrives as a node for the same reason the action does: the
 * chosen value is state, and state belongs to the screen. The plain text fallback
 * this slot once had is gone, because a strip that can render a label nothing can
 * change is a strip that can lie about being a setting.
 */
export function OptionsRow({
  expiry,
  passwordSet = false,
  onAddPassword,
  addPasswordRef,
  action,
  quiet = false,
  density = "default",
  className,
}: {
  /** The expiry control. See above: this slot never holds dead text. */
  expiry: ReactNode;
  /** True once a password row exists above this strip: the affordance is spent. */
  passwordSet?: boolean;
  onAddPassword?: () => void;
  /* So a surface that removes the password row can hand focus back to the
   * affordance it came from. Without it the screen has to find this button in the
   * DOM by the words on it, which is a screen reaching into shared UI. */
  addPasswordRef?: Ref<HTMLButtonElement> | undefined;
  action?: ReactNode;
  quiet?: boolean;
  density?: "default" | "touch";
  className?: string;
}) {
  const touch = density === "touch";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-hairline border-t bg-surface-sunken px-3.5 py-2.5",
        className
      )}
    >
      <div
        className={cn(
          "flex gap-1 transition-opacity duration-[var(--duration-quick)] motion-reduce:transition-none",
          quiet && "pointer-events-none opacity-40",
          touch ? "-mx-1 -my-2 min-w-0 flex-col items-start" : "items-center"
        )}
      >
        {expiry}
        {/* enter={false}: on a screen that loads with no password set, the button
         * was always there and has no arrival to explain. */}
        <Collapse axis="inline" enter={false} open={!passwordSet}>
          <Button
            className="gap-1.5 whitespace-nowrap"
            onClick={onAddPassword}
            ref={addPasswordRef}
            size={touch ? "tap" : "sm"}
            variant="ghost"
          >
            <Icon name="lock" size={12} />
            Ask for a password
          </Button>
        </Collapse>
      </div>
      {action}
    </div>
  );
}
