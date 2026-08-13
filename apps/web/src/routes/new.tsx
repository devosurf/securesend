import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneBar } from "../compose/bar";
import { ComposeProvider, useComposing } from "../compose/composing";
import { Envelope } from "../compose/envelope";
import { PostedReceipt, Receipt } from "../compose/receipt";
import { PhaseSwap } from "../lib/motion";
import { slackContextHere } from "../slack/payload";
import { Collapse } from "../ui/collapse";
import { SiteNav } from "../ui/site-nav";
import { WatchProvider } from "../watch/watching";

/*
 * /new is the create surface for somebody who arrived from a Slack channel.
 *
 * It is the product's own create surface rather than a Slack-flavoured version of
 * one, and that is the whole argument for the integration: the secret is typed in
 * the one place built to hold it. Same hero, same panel, same parts, same options
 * strip. Four things differ, and nothing else does. The action says where the link
 * is going, Enter sends it, one line under the panel says the secret itself never
 * travels through Slack, and the receipt is in the past tense because the channel
 * already has the link by the time it paints.
 *
 * It is client-rendered and it has to be: the context rides in the fragment, so
 * nothing about this page can be decided anywhere but in the browser holding it.
 * The build gives it the same empty shell every other client-rendered route gets.
 *
 * ==== what is deliberately absent =========================================
 *
 * The homepage's below-fold sections and this device's own history. The sender
 * came here from a channel with a job in hand, so the pitch has already been made,
 * and the management surface for this particular secret is about to be the private
 * message under the post rather than a list in this browser. Showing both would
 * offer two places to burn one secret.
 *
 * ==== what a bad fragment does ============================================
 *
 * Nothing. The address bar is the one input anybody can write, so a fragment that
 * is not a context is no context, and this page is then the ordinary create
 * surface with the ordinary receipt: an honest create page is a perfectly good
 * thing to be. A context past its 30 minute window is the same answer, one step
 * later: the link is made and nothing is posted, because the handle it would have
 * been posted to has expired.
 */

export const Route = createFileRoute("/new")({
  component: New,
});

/* Which receipt is this press's answer: the past tense one only where the messages
 * actually went. A handle past its window makes an ordinary link and gets the
 * ordinary receipt, rather than naming a channel nothing reached. */
function Sent() {
  const { posted } = useComposing();

  return posted ? <PostedReceipt /> : <Receipt />;
}

function Fold() {
  const { stage, started } = useComposing();

  const compose = (
    <div className="flex flex-col items-center">
      <Collapse className="w-full" enter={false} open={!started}>
        <div className="mx-auto max-w-[760px] pb-8 text-center md:pb-0">
          <h1 className="text-balance font-display text-display-sm text-ink-strong md:text-display">
            Send a secret
            <br />
            that <span className="text-accent">disappears.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[480px] font-sans text-body text-ink-muted md:mt-7">
            Type it, paste it, or <span className="md:hidden">add a file.</span>
            <span className="hidden md:inline">
              drop a file in. It's locked in this browser before it goes
              anywhere.
            </span>
          </p>
        </div>
      </Collapse>

      <Envelope />
    </div>
  );

  return (
    <div className="px-5 pt-8 md:min-h-[760px] md:px-6 md:pt-[84px]">
      <PhaseSwap move="advance" phase={stage}>
        {stage === "compose" ? compose : <Sent />}
      </PhaseSwap>
    </div>
  );
}

function Page() {
  const { dragging } = useComposing();

  return (
    /* The whole page is the drop target, for the same reason the homepage's is: a
     * sender dragging a file at the browser is aiming at the window rather than at
     * a rectangle. */
    <div
      className="relative flex h-dvh flex-col overflow-hidden md:block md:h-auto md:overflow-visible"
      {...dragging}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-dvh [background:var(--wash-accent)] md:h-[900px]"
      />

      <SiteNav />

      {/* The scroll region on a phone, and no box at all at a desk. */}
      <div className="min-h-0 flex-1 overflow-y-auto md:contents">
        <main className="relative">
          <Fold />
        </main>
      </div>

      <PhoneBar />
    </div>
  );
}

function New() {
  /* Read once, on the first render. The context is a fact about how this tab was
   * opened, so a later read would be answering a different question. */
  const [slack] = useState(slackContextHere);

  return (
    /* Watching wraps composing because the phone's bar and the ordinary receipt
     * both ask it what became of the secret. Neither is on the posted receipt,
     * where the answer to that question lives in Slack. */
    <WatchProvider>
      <ComposeProvider slack={slack}>
        <Page />
      </ComposeProvider>
    </WatchProvider>
  );
}
