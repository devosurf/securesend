import type { ReactNode } from "react";
import { useAtDesk } from "../lib/lane";
import { cn } from "../lib/utils";
import type { SlackContext } from "../slack/payload";
import { Button, buttonVariants } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { CopyRow } from "../ui/copy-row";
import { Icon, type IconName } from "../ui/icon";
import { LinkSpecimen } from "../ui/link-specimen";
import { Panel } from "../ui/panel";
import { StatusRow } from "../ui/status-row";
import { TakeButton } from "../ui/take-button";
import { type Kind, watchedNow } from "../watch/statuses";
import { useWatching } from "../watch/watching";
import { spokenExpiry, useComposing } from "./composing";

/*
 * The receipt, a third of a second later.
 *
 * It stops being a handoff and becomes the start of a short relationship, because this
 * device now holds the management token: it can watch the secret and it can kill it. The
 * likeliest moment in the whole product that anybody burns a secret is the three seconds
 * after pasting a link into the wrong channel, right now, on the screen they are already
 * staring at, with the wrong window still open behind it. So the burn is here and not
 * only in the history.
 *
 * Both readings live in one grid cell, so the cell is always as tall as the taller of
 * them and neither ever moves the other. The two facts under the link do not change
 * shape, they stop being true, so they leave on the slot move instead: reserving room for
 * facts that are gone would leave a hole under the tombstone.
 *
 * The link is shown without its scheme and copied with it. On screen `https://` is
 * fourteen characters of noise in front of the only part that matters; on a clipboard it
 * is what makes the thing a link when it lands in a chat window.
 *
 * It is never truncated, at either width. The frames were drawn against a mock link short
 * enough to fit one line, and a real one is not: the id is about 22 characters and the
 * fragment token runs from 46 to 67, so a single truncated line would end before the hash
 * and show the sender everything except the key, on the screen whose own sentence says
 * the part after the hash is the key. LinkSpecimen breaks it at the hash instead, which is
 * the one joint the link actually has.
 */

/*
 * What the screen says once the link is no longer live.
 *
 * The burn is the case this exists for, and it is the frame's. The other two are the
 * burn losing a race, which is reachable and is the only way this receipt ever hears
 * about them: somebody read the secret in the seconds before the press, or its clock
 * ran out first. Both are honest and neither is a failure to apologise for, so they
 * take the same composition with the heading telling the truth.
 */
function tombstone(status: Kind): { body: string; heading: string } {
  if (status === "used") {
    return {
      body: "Somebody got to it before your burn did, so there was nothing left to destroy. Either way the link is dead now.",
      heading: "It had already been used.",
    };
  }
  if (status === "expired") {
    return {
      body: "The clock ran out before anybody used it, so there was nothing left to burn. Send a fresh one if they still need it.",
      heading: "It had already expired.",
    };
  }

  return {
    body: "Nobody opened it, and nobody can now. Send a fresh one if they still need it.",
    heading: "You burned it.",
  };
}

function Semantic({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 font-sans text-ink-muted text-small md:items-center">
      <Icon className="mt-0.5 shrink-0 text-ink-faint md:mt-0" name={icon} />
      {children}
    </p>
  );
}

/** The link itself, in the shape each width can hand it over in. */
function LinkPanel() {
  const { copyLink, copied, link } = useComposing();
  const atDesk = useAtDesk();

  if (!link) {
    return null;
  }

  return atDesk ? (
    <Panel className="mt-8 flex items-center justify-between gap-4 px-4 py-3">
      <LinkSpecimen className="flex-1" value={link.shown} />
      <TakeButton
        className="shrink-0"
        done={copied}
        doneLabel="Copied"
        icon="copy"
        label="Copy link"
        onTake={copyLink}
        size="sm"
      />
    </Panel>
  ) : (
    <Panel className="mt-6 overflow-hidden">
      <CopyRow
        density="touch"
        label="link"
        layout="stacked"
        /* CopyRow shows its tick once this settles, so a browser that refused
         * the write has to leave it unsettled. Otherwise the row says Copied
         * over a clipboard that does not have the link in it. */
        onCopy={async () => {
          if (!(await copyLink())) {
            throw new Error("the clipboard refused the link");
          }
        }}
        shape="link"
        value={link.shown}
        verbatim
      />
    </Panel>
  );
}

/* The whole feature's cost, and it only appears when the sender took the option.
 * Body, not small: this is not a footnote to the link, it is the second half of
 * the same job. */
function SealPanel() {
  const { seal } = useComposing();

  if (!seal) {
    return null;
  }

  return (
    <Panel className="mt-5 bg-surface-sunken px-4 py-4 md:mt-6 md:px-5 md:py-5">
      <h2 className="font-sans font-semibold text-body text-ink">
        Send the password separately.
      </h2>
      <p className="mt-2 font-sans text-body text-ink-muted md:mt-2.5">
        A link and its password in one message is one message that opens the
        secret.
        <span className="hidden md:inline">
          {" "}
          Say it out loud, text it, use a different app. Anything that isn't the
          message carrying the link.
        </span>
        <span className="md:hidden"> Use a different app.</span>
      </p>
    </Panel>
  );
}

export function Receipt() {
  const { expiry, link, seal, sendAnother } = useComposing();
  const atDesk = useAtDesk();
  const { askToBurn, statusOf, trouble } = useWatching();

  if (!link) {
    return null;
  }

  /* This device only ever hears about its own fresh secret through a burn, so a row
   * that is not sealed is the answer to a press that happened a moment ago. */
  const watched = statusOf(link.id);
  const settled = watched && watched.status !== "sealed" ? watched : null;

  const live = (
    <div>
      <h1 className="font-sans text-heading text-ink-strong">
        Your link is ready.
      </h1>
      <p className="mt-3 max-w-[480px] font-sans text-body text-ink-muted md:mt-4">
        Send it however you normally talk to them.{" "}
        {atDesk
          ? "Paste the whole thing, the part after the hash is the key."
          : "It has to arrive whole, because the part after the hash is the key."}
      </p>

      <LinkPanel />
      <SealPanel />
    </div>
  );

  /* The link is gone, so the screen stops showing a link. What is left is the half
   * that was never secret: the row, which keeps the id because the id did not die. */
  const row = settled ?? watchedNow(link);
  const said = tombstone(row.status);

  const dead = (
    <div>
      <h1 className="font-sans text-heading text-ink-strong">{said.heading}</h1>
      <p className="mt-3 max-w-[480px] font-sans text-body text-ink-muted md:mt-4">
        {said.body}
      </p>

      <Panel className="mt-6 overflow-hidden md:mt-8">
        <StatusRow
          density={atDesk ? "default" : "touch"}
          id={row.shown}
          layout={atDesk ? "row" : "stacked"}
          status={row.status}
          timing={row.timing}
        />
      </Panel>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <div className="grid">
        <div
          aria-hidden={settled !== null}
          className={cn(
            "col-start-1 row-start-1 transition-[opacity,filter] duration-[var(--duration-settle)] ease-[var(--ease-in-out-soft)] motion-reduce:transition-none",
            settled ? "pointer-events-none opacity-0 blur-[2px]" : "opacity-100"
          )}
        >
          {live}
        </div>
        <div
          aria-hidden={settled === null}
          className={cn(
            "col-start-1 row-start-1 transition-opacity duration-[var(--duration-settle)] ease-[var(--ease-in-out-soft)] motion-reduce:transition-none",
            settled
              ? "opacity-100 delay-[120ms]"
              : "pointer-events-none opacity-0"
          )}
        >
          {dead}
        </div>
      </div>

      <Collapse enter={false} open={settled === null}>
        <div className="flex flex-col gap-3 pt-6 md:gap-2.5">
          {seal ? (
            <Semantic icon="lock">
              They'll need the password before it opens.
            </Semantic>
          ) : null}
          <Semantic icon="eye-off">
            It opens once. After that it's gone, including for you.
          </Semantic>
          <Semantic icon="clock">
            Expires in {spokenExpiry(expiry)} if nobody opens it.
          </Semantic>
        </div>
      </Collapse>

      <div className="mt-8 border-hairline border-t pt-5 md:mt-9">
        {/* The one sentence that explains where the next visit's status list came
         * from. There is no management URL, no email and no account, so if this
         * sentence is not here the list arrives out of nowhere. */}
        <Collapse enter={false} open={settled === null}>
          <p className="pb-5 font-sans text-ink-muted text-small">
            This device is watching it. Come back here to see when it's opened,
            or burn it early.
          </p>
        </Collapse>

        <div className="flex items-center gap-2">
          <Button
            onClick={sendAnother}
            size={atDesk ? "sm" : "tap"}
            variant="secondary"
          >
            Send another
          </Button>

          {/* The affordance spends itself: once the secret is burned there is nothing
           * left to offer. On a phone the burn is in the bar instead, within the same
           * reach as the share it sits under. */}
          <Collapse
            axis="inline"
            className="hidden md:grid"
            enter={false}
            open={settled === null}
          >
            <div className="flex items-center">
              <Button
                className="whitespace-nowrap"
                onClick={() => askToBurn(watchedNow(link))}
                size="sm"
                variant="ghost"
              >
                Burn it now
              </Button>
            </div>
          </Collapse>
        </div>

        {/* A burn that did not happen. Nothing was destroyed, which is the whole
         * content of the sentence, so it is said once and quietly. */}
        <Collapse open={trouble}>
          <p className="pt-4 font-sans text-ink-faint text-small">
            That didn't go through, so the secret is still sealed. Try again in
            a moment.
          </p>
        </Collapse>
      </div>
    </div>
  );
}

/**
 * The way back into the channel the sender walked out of.
 *
 * `slack://channel` focuses the Slack client on this exact conversation. It opens
 * a client rather than a tab, so like a mailto it does not wear OUTBOUND: a
 * `target="_blank"` on a scheme the browser hands straight off leaves an empty
 * window behind on some of them.
 */
function slackChannel({ channelId, teamId }: SlackContext): string {
  return `slack://channel?team=${encodeURIComponent(teamId)}&id=${encodeURIComponent(channelId)}`;
}

/*
 * The receipt for a secret that is already in a channel.
 *
 * Everything here is in the past tense, and that is the whole design of it: both
 * messages went up as part of the press, so by the time this paints the channel
 * has held them for a third of a second. Nothing on this screen is waiting on the
 * sender, and nothing on it may read as pending.
 *
 * No burn and no "this device is watching it". The controls for this secret are
 * the private message under the post, where the sender is about to be, and two
 * places to destroy one secret is one place too many. The tab gets an explicit
 * blessing to close instead, because it cannot close itself and cannot hand focus
 * back to Slack, and a receipt that leaves that unsaid leaves a window open with a
 * secret's own link in it.
 */
export function PostedReceipt() {
  const { expiry, seal, slack } = useComposing();
  const atDesk = useAtDesk();

  if (!slack) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <h1 className="font-sans text-heading text-ink-strong">
        Posted to #{slack.channelName}.
      </h1>
      <p className="mt-3 max-w-[480px] text-balance font-sans text-body text-ink-muted md:mt-4">
        The secret itself never went through Slack. Only the finished link did.
      </p>

      <LinkPanel />
      <SealPanel />

      <div className="flex flex-col gap-3 pt-6 md:gap-2.5">
        {seal ? (
          <Semantic icon="lock">
            They'll need the password before it opens.
          </Semantic>
        ) : null}
        <Semantic icon="eye-off">
          It opens once. After that it's gone, including for you.
        </Semantic>
        <Semantic icon="clock">
          Expires in {spokenExpiry(expiry)} if nobody opens it.
        </Semantic>
        {/* The caveat, owed to a sender who has just widened the audience from one
         * person to a room: the link is the key, and the channel now holds it. */}
        <Semantic icon="eye">
          Anyone in #{slack.channelName} can open it. The first one to click
          gets it.
        </Semantic>
      </div>

      <div className="mt-8 border-hairline border-t pt-5 md:mt-9">
        <p className="pb-5 font-sans text-ink-muted text-small">
          The controls are already under the post, and only you can see them.
          Extend it there, or burn it early.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* An anchor wearing the button, not a button that navigates: this is a
           * destination, and the look is shared through buttonVariants precisely
           * so a destination never has to pretend to be a control. */}
          <a
            className={cn(
              buttonVariants({
                size: atDesk ? "sm" : "tap",
                variant: "secondary",
              }),
              "gap-2"
            )}
            href={slackChannel(slack)}
          >
            Open #{slack.channelName} in Slack
            <Icon name="arrow-right" size={13} />
          </a>

          <p className="font-sans text-ink-muted text-small">
            Or close this tab. Nothing here is waiting on you.
          </p>
        </div>
      </div>
    </div>
  );
}
