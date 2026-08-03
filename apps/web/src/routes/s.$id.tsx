import { createFileRoute } from "@tanstack/react-router";
import { PhaseSwap } from "../lib/motion";
import { DeadEndScreen, deadEndFor } from "../reveal/dead-ends";
import { Latch } from "../reveal/latch";
import { Opened, Saved, TakeBar } from "../reveal/opened";
import { worthTaking } from "../reveal/parts";
import { type Revealing, useRevealing } from "../reveal/revealing";
import { Shell } from "../reveal/shell";

/*
 * /s/<id>#key is the recipient's whole side of the product, in one screen.
 *
 * It is client-rendered and it has to be: the key is in the fragment, so nothing about
 * this page can be decided anywhere but in the browser holding it. The build gives this
 * route an empty shell carrying `noindex` in the document, and the api sends the same
 * header on every `/s/` response.
 *
 * Eleven screens, and the division between them is the page's structure rather than an
 * implementation detail: it is the difference between what the instance tells you when
 * you arrive and what your own press does next. src/reveal/revealing.ts owns that
 * machine; this file owns which composition each of its states wears.
 *
 * ==== the moves ============================================================
 *
 * The reveal is the single most designed moment in the product and it happens inside one
 * component, so PhaseSwap plays it against the same keyframes a navigation would. Sealed
 * to open is a reveal, 520ms of uncover. Sealed to retry is a burn, because something
 * died. Open to saved is a burn for the same reason, and so is a press that lands on a
 * dead end: that is the same event seen from the outside.
 *
 * ==== the wash =============================================================
 *
 * It follows the act, not the page. Asking, sealed, retry and open wear it; every dead
 * end and the saved ending do not, because the burn's whole argument is that finality
 * reads as stillness, and a screen with nothing left to do gets no atmosphere.
 */

export const Route = createFileRoute("/s/$id")({
  component: Reveal,
});

/** The screens that still have something to do, which are the ones wearing the wash. */
const LIVE = ["asking", "sealed", "retry", "open"];

function Body({ revealing }: { revealing: Revealing }) {
  const { answered, screen, secret } = revealing;

  if (screen === "asking") {
    /* One request, and it is fast. What holds the space is the shell the reader is
     * already looking at, because the alternatives are a spinner, which this product
     * does not have, or the latch drawn optimistically, which would say "nobody has
     * read it" before anybody had asked. */
    return null;
  }

  if (screen === "sealed" || screen === "retry") {
    return <Latch revealing={revealing} />;
  }

  if (screen === "open" && secret) {
    return (
      <Opened
        onSaved={revealing.saveIt}
        onTake={revealing.takeAll}
        secret={secret}
        taken={revealing.taken}
      />
    );
  }

  if (screen === "saved") {
    return <Saved />;
  }

  return <DeadEndScreen answered={answered} name={deadEndFor(screen)} />;
}

function Reveal() {
  const { id } = Route.useParams();
  const revealing = useRevealing(id);
  const { screen, secret, taken, takeAll } = revealing;

  /* A thumb-height band, and only where one is needed: the take control is the page's
   * floor on a phone and the panel's last row at a desk. */
  const floor =
    screen === "open" && secret && worthTaking(secret) ? (
      <div className="border-hairline border-t bg-surface-sunken px-5 pt-4 pb-6">
        <div className="flex flex-col items-stretch gap-3">
          <TakeBar onTake={takeAll} secret={secret} taken={taken} />
        </div>
      </div>
    ) : undefined;

  return (
    <Shell {...(floor && { floor })} wash={LIVE.includes(screen)}>
      <PhaseSwap
        className="w-full flex-1 md:flex-none"
        move={screen === "open" ? "reveal" : "burn"}
        phase={screen}
      >
        <Body revealing={revealing} />
      </PhaseSwap>
    </Shell>
  );
}
