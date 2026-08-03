import type { MouseEvent } from "react";
import { Button } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { Icon } from "../ui/icon";
import { type Handoff, useComposing } from "./composing";

/*
 * The composer's floor on a phone, and the whole reason the phone layout is three
 * bands rather than one page.
 *
 * Tapping the note raises a keyboard that eats about 336 of 844 points, and below
 * the field is exactly where it lands. A straight translation of the desk layout
 * would therefore hide the affordances and the action the moment the sender starts
 * working. So they live here, pinned directly above the keyboard in the bottom
 * third where a thumb already rests.
 *
 * It is a flex sibling of the scroll region, never an overlay. An overlay can end
 * up sitting on top of a row's own remove button, and a fix that covers the control
 * it was helping is not a fix.
 *
 * It stays put while the sender scrolls down to read how the product works, rather
 * than appearing and disappearing by context. Reach is the only kind of difference
 * a phone earns itself on; a control that comes and goes invents a second one.
 */

const SHARE_LABEL: Record<Handoff, string> = {
  copied: "Link copied",
  idle: "Share the link",
  shared: "Shared",
};

/* A control in the bar must not pull the caret out of the field being typed into:
 * that lowers the keyboard, and the layout jumps twice for a press that was never
 * about focus. Adding a login is the one exception, and it takes focus deliberately,
 * into the field it just made. */
function keepCaret(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

const BAND =
  "relative shrink-0 border-hairline border-t bg-surface-sunken px-5 md:hidden";

export function PhoneBar() {
  const {
    addPair,
    affordances,
    canSend,
    handoff,
    locking,
    pair,
    send,
    shareLink,
    stage,
  } = useComposing();

  if (stage === "sent") {
    return (
      <div className={`${BAND} pt-4 pb-6`}>
        <p className="font-sans text-ink-muted text-small">
          {handoff === "idle"
            ? "Whichever app you pick gets the whole link, key and all."
            : "Anyone holding that link can open it, so keep it to one person."}
        </p>

        {/* The label is what the press managed to do, which is not always what it
         * offered: shareLink in composing.tsx has the three answers. */}
        <Button className="mt-3 w-full gap-2" onClick={shareLink} size="touch">
          <Icon name={handoff === "idle" ? "share" : "check"} size={16} />
          {SHARE_LABEL[handoff]}
        </Button>
      </div>
    );
  }

  return (
    <div className={`${BAND} pt-2.5 pb-6`}>
      <Collapse enter={false} open={pair === null}>
        <div className="-mx-3 flex items-center">
          <Button
            className="gap-1.5 px-3"
            onClick={addPair}
            onMouseDown={keepCaret}
            ref={affordances.pairOnPhone}
            size="tap"
            variant="ghost"
          >
            <Icon name="plus" size={12} />
            Add a username and password
          </Button>
        </div>
      </Collapse>

      <Button
        busy={locking}
        className="mt-2 w-full"
        disabled={!canSend}
        onClick={send}
        size="touch"
      >
        {locking ? "Locking…" : "Create link"}
      </Button>

      {/* The one line from the introduction that is still true while the sender is
       * typing, kept where they will read it last. */}
      <p className="mt-3 text-center font-sans text-ink-faint text-small">
        Locked in this browser before it leaves
      </p>
    </div>
  );
}
