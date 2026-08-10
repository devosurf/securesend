import type { MouseEvent } from "react";
import { Button } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { Icon } from "../ui/icon";
import { watchedNow } from "../watch/statuses";
import { useWatching } from "../watch/watching";
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
    link,
    locking,
    pair,
    pickFiles,
    send,
    shareLink,
    stage,
  } = useComposing();
  const { askToBurn, statusOf } = useWatching();

  if (stage === "sent") {
    const burned = link !== null && statusOf(link.id)?.status === "burned";

    /*
     * The share, and the burn under it. A burned link has nothing to share, so the
     * whole band closes rather than swapping its primary for a different action: a
     * position that becomes a different button teaches that the position is generic.
     */
    return (
      <Collapse
        className="relative shrink-0 md:hidden"
        enter={false}
        open={!burned}
      >
        <div className="border-hairline border-t bg-surface-sunken px-5 pt-4 pb-6">
          <p className="font-sans text-ink-muted text-small">
            {handoff === "idle"
              ? "Whichever app you pick gets the whole link, key and all."
              : "Anyone holding that link can open it, so keep it to one person."}
          </p>

          {/* The label is what the press managed to do, which is not always what it
           * offered: shareLink in composing.tsx has the three answers. */}
          <Button
            className="mt-3 w-full gap-2"
            onClick={shareLink}
            size="touch"
          >
            <Icon name={handoff === "idle" ? "share" : "check"} size={16} />
            {SHARE_LABEL[handoff]}
          </Button>

          {/* Under the primary, in the same reach, at a tenth of its weight. Burn
           * lands 24px from the bottom edge, the single most pressable place on a
           * phone: weight and width do the separating, and what stands between a
           * misfire and a destroyed secret is the dialog. */}
          {link ? (
            <div className="mt-2.5 flex justify-center">
              <Button
                onClick={() => askToBurn(watchedNow(link))}
                size="tap"
                variant="ghost"
              >
                Burn it now
              </Button>
            </div>
          ) : null}
        </div>
      </Collapse>
    );
  }

  return (
    <div className={`${BAND} pt-2.5 pb-6`}>
      {/* There is nothing to drag on a phone, so there is no armed state and no
       * drop prompt. What the desk's drop zone really said is that files are
       * welcome and this is where they land, and here that is carried by the
       * attach affordance being permanently in reach. It opens this device's own
       * picker, which is where the photos are: a screenshot of a config is a file
       * like any other. */}
      {/* Both go unavailable while the envelope is being sealed, because the press
       * has already decided what it is sealing: a part added after that decision
       * would be the sender watching a row arrive and then not be in the secret. At a
       * desk the dim over the panel says this; the bar is not behind the dim, so it
       * has to say it itself. */}
      <div className="-mx-3 flex items-center">
        <Collapse axis="inline" enter={false} open={pair === null}>
          <Button
            className="gap-1.5 px-3"
            disabled={locking}
            onClick={addPair}
            onMouseDown={keepCaret}
            ref={affordances.pairOnPhone}
            size="tap"
            variant="ghost"
          >
            <Icon name="plus" size={12} />
            Add a username and password
          </Button>
        </Collapse>
        <Button
          className="gap-1.5 px-3"
          disabled={locking}
          onClick={pickFiles}
          onMouseDown={keepCaret}
          ref={affordances.attachOnPhone}
          size="tap"
          variant="ghost"
        >
          <Icon name="plus" size={12} />
          Attach a file
        </Button>
      </div>

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
