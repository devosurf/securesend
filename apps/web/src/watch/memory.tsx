import { useEffect, useRef, useState } from "react";
import { useAtDesk } from "../lib/lane";
import { inAbout } from "../lib/timing";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Collapse, SETTLE_MS } from "../ui/collapse";
import { Icon } from "../ui/icon";
import { Panel } from "../ui/panel";
import { StatusRow } from "../ui/status-row";
import { TextAction } from "../ui/text-link";
import { type CheckTrouble, type Freshness, useWatching } from "./watching";

/*
 * The device's memory, and at rest it costs the homepage one line.
 *
 * At create the instance hands this browser a management token, so every device that has
 * ever sent a secret is now also a device with a history. If that history takes a panel,
 * the homepage quietly becomes a dashboard for everybody who has used the product once,
 * and that is the failure mode that killed the previous version. So at a desk it is one
 * line that opens. On a phone there is no room to hide anything behind a control that
 * then has to be found again, so the list is simply there, under its own label.
 *
 * The line is not a count of rows. It skips the burned ones and the expired ones,
 * because a dead secret is not news and a number beside it is noise about nothing. And
 * it says used rather than opened: the instance watches a reveal get pressed and the
 * ciphertext go out, and whether anybody could read what came back never leaves that
 * tab. A count is the hardest place in the product to hedge a claim, since there is
 * nowhere to put a caveat beside a number.
 */

const FRESHNESS: Record<Freshness, string> = {
  checking: "Checking now.",
  fresh: "Checked a moment ago.",
  load: "Checked when you loaded this page.",
};

const ONLY_THIS_BROWSER =
  "Only this browser remembers these. Clear your site data and they're forgotten.";

const QUIET = "font-sans text-ink-faint text-small";

/*
 * The device's memory in a sentence, not a readout, and it leads with the news.
 *
 * It ignores the burned rows and the expired ones, because a dead secret is not news and
 * a number beside it is noise about nothing. When nothing is sealed either, the sentence
 * drops that half rather than saying "0 still sealed", which is a readout of an absence.
 */
function summary(used: number, sealed: number): string {
  const still = `${sealed} still sealed, from this browser`;

  if (sealed === 0) {
    return `${used} used, from this browser`;
  }

  return used === 0 ? still : `${used} used, ${still}`;
}

/*
 * The view rides the slot as it opens, because the line sits at the bottom of a page
 * whose hero already spends two thirds of the fold: a list that opened entirely below
 * the crease would be a click that appeared to do nothing.
 *
 * It follows frame by frame for as long as the slot is growing, and only as far as it has
 * to, so the list arrives under the line that was just pressed rather than being chased
 * by a second animation to the bottom of the page.
 */
function follow(node: HTMLElement | null) {
  if (!node) {
    return;
  }

  const growing = performance.now() + SETTLE_MS + 120;

  const step = () => {
    const over = node.getBoundingClientRect().bottom - window.innerHeight + 24;
    if (over > 0) {
      window.scrollBy(0, over);
    }
    if (performance.now() < growing) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function Rows({ burnable }: { burnable: boolean }) {
  const { askToBurn, rows } = useWatching();
  const atDesk = useAtDesk();

  return (
    <Panel className="mt-3 overflow-hidden">
      {rows.map((row, index) => (
        <StatusRow
          className={cn(index > 0 && "border-hairline border-t")}
          density={atDesk ? "default" : "touch"}
          id={row.shown}
          key={row.id}
          layout={atDesk ? "row" : "stacked"}
          onRequestBurn={
            burnable && row.status === "sealed"
              ? () => askToBurn(row)
              : undefined
          }
          status={row.status}
          timing={row.timing}
        />
      ))}
    </Panel>
  );
}

/*
 * The last state before the element disappears, and the only place a sender ever sees
 * the seven-day rule.
 *
 * There is no collapsed line here and that is derived rather than arbitrary: the line
 * exists to summarise news, and there is no news. Nothing is sealed, so nothing can be
 * burned; nothing can change, so there is nothing to re-check. One dead row is not worth
 * hiding behind a control, so it is simply shown under a label.
 *
 * The forgetting itself is stated once, as a fact about how the product works rather
 * than an event that happened to you. The tempting version says "3 links you can no
 * longer see", which is a notification about nothing: there is no action behind it, and
 * the secrets were gone long before their tombstones were.
 */
function OnlyTombstones() {
  return (
    <div className="mt-6 md:mt-8">
      <span className={QUIET}>From this browser</span>
      <p className={cn(QUIET, "mt-1")}>{ONLY_THIS_BROWSER}</p>

      <Rows burnable={false} />

      <p className={cn(QUIET, "mt-3")}>
        Older links have been forgotten. Nothing is kept after a week.
      </p>
    </div>
  );
}

/*
 * Why a re-check brought nothing back, in the two shapes there are of that.
 *
 * The metered one names no culprit. Something refused to answer this often, and whether
 * that was the instance itself or a proxy in front of it is not something this tab can
 * see: naming one would be asserting a cause rather than reporting a fact.
 */
function troubleIs(trouble: CheckTrouble): string {
  return trouble.what === "metered"
    ? `Something is limiting how often this can be asked, so these weren't re-checked. Try again in ${inAbout(trouble.retryAfter)}.`
    : "Nothing answered, so these weren't re-checked. Check your connection and try again.";
}

/*
 * This browser has sent links and nothing would say what became of them.
 *
 * Its own state rather than the element quietly disappearing, because disappearing is
 * what "you have sent nothing" looks like, and a sender whose history vanished because
 * their office met a rate limit would read it as the product having forgotten. No rows,
 * because a row is a claim about a secret's state and there is no state to claim. The
 * re-check is here because asking again is the whole of what there is to do.
 */
function Unchecked({
  freshness,
  onRecheck,
  trouble,
}: {
  freshness: Freshness;
  onRecheck: () => Promise<void>;
  trouble: CheckTrouble;
}) {
  return (
    <div className="mt-6 md:mt-8">
      <span className={QUIET}>From this browser</span>
      <p className={cn(QUIET, "mt-1")}>
        This browser has sent links, and nothing came back about them, so none
        are shown.
      </p>
      <div className={cn(QUIET, "mt-2.5 flex flex-wrap items-center gap-2")}>
        {troubleIs(trouble)}
        {/* Gone while a check is in flight, as on the panel: two overlapping asks can
         * answer out of order, and the later answer would be the older one. */}
        {freshness === "checking" ? null : (
          <TextAction className="text-small" onClick={onRecheck} tone="quiet">
            Check again
          </TextAction>
        )}
      </div>
    </div>
  );
}

export function DeviceMemory() {
  const { checkTrouble, freshness, memory, recheck, refresh, rows, trouble } =
    useWatching();
  const atDesk = useAtDesk();

  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  /* The sentence outlives the trouble that made it, so the slot has something to say on
   * the way shut, the same way the composer's refusal does. */
  const said = useRef("");
  if (checkTrouble) {
    said.current = troubleIs(checkTrouble);
  }

  /*
   * Whether this mount has had a check of its own answer yet.
   *
   * The provider outlives this element, which is unmounted for the length of the receipt,
   * so on the way back its state can still hold the verdict of a check from before the
   * secret that was just made. Nothing is said about a check until this mount has one.
   */
  const [checked, setChecked] = useState(false);

  /*
   * One lookup when this comes into view, which is page load and again after Send
   * another: the element is unmounted for the length of the receipt, so a sender who
   * sends a second secret gets a list with it in.
   */
  useEffect(() => {
    refresh()
      .catch(() => {
        // Nothing to report: a lookup that did not land answers rather than throwing,
        // and the rows on screen stay as they are.
      })
      .finally(() => setChecked(true));
  }, [refresh]);

  if (memory === "none") {
    return null;
  }

  if (memory === "forgotten") {
    return <OnlyTombstones />;
  }

  if (memory === "unchecked" && checked && checkTrouble) {
    return (
      <Unchecked
        freshness={freshness}
        onRecheck={recheck}
        trouble={checkTrouble}
      />
    );
  }

  const used = rows.filter((row) => row.status === "used").length;
  const sealed = rows.filter((row) => row.status === "sealed").length;

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    follow(list.current);
  }

  const inside = (
    <div className="pt-2 pb-2" ref={list}>
      <p className={QUIET}>{ONLY_THIS_BROWSER}</p>

      <Rows burnable />

      <p className={cn(QUIET, "mt-3")}>
        This is the link without its key, so it can't be re-sent. Match it
        against the message you sent.
      </p>

      {/* The page is not a feed and must not imply it is. One process, no websockets,
       * so the sender re-checks by asking.
       *
       * The control leaves while the check is in flight rather than greying out. It is
       * one word inside a sentence, and a disabled word reads as a rendering fault. */}
      <div className={cn(QUIET, "mt-2.5 flex flex-wrap items-center gap-2")}>
        {FRESHNESS[freshness]}
        {freshness === "checking" ? null : (
          <TextAction className="text-small" onClick={recheck} tone="quiet">
            Check again
          </TextAction>
        )}
      </div>

      {/* A re-check that brought nothing back. The rows above are still true, they are
       * just as old as the line already says, so this adds the reason and never takes the
       * list away. */}
      <Collapse open={checked && checkTrouble !== null}>
        <p className={cn(QUIET, "pt-2")}>{said.current}</p>
      </Collapse>

      {/* A burn that did not happen. Said once, quietly, and never in red: nothing was
       * destroyed, which is the whole content of the sentence. */}
      <Collapse open={trouble}>
        <p className={cn(QUIET, "pt-2")}>
          That didn't go through, so the secret is still there. Try again in a
          moment.
        </p>
      </Collapse>
    </div>
  );

  if (!atDesk) {
    return (
      <div className="mt-8">
        <span className="font-sans text-ink-muted text-small">
          {summary(used, sealed)}
        </span>
        {inside}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Button
        aria-expanded={open}
        className="-ml-3 gap-2 font-normal font-sans text-ink-muted text-small hover:text-ink"
        onClick={toggle}
        size="sm"
        variant="ghost"
      >
        {summary(used, sealed)}
        <Icon
          className={cn(
            "transition-transform duration-[var(--duration-quick)] motion-reduce:transition-none",
            open && "rotate-180"
          )}
          name="chevron-down"
          size={12}
        />
      </Button>

      <Collapse enter={false} open={open}>
        {inside}
      </Collapse>
    </div>
  );
}
