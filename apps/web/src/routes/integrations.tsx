import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { Icon } from "../ui/icon";
import { Panel } from "../ui/panel";
import { SiteNav } from "../ui/site-nav";
import { TextLink } from "../ui/text-link";

/*
 * securesend.dev/integrations is the inventory: everywhere this product could be
 * reached from, and what is true about each one today.
 *
 * ==== the constraint, said first ==========================================
 *
 * A secret is typed and locked in a browser tab, and that is not a limitation an
 * integration gets to route around: the tab is the only place the key can exist
 * without us. So an integration moves the beginning and the end of the errand and
 * nothing in between, and the page says that above the list rather than under it.
 *
 * ==== the honesty rules this page is built on =============================
 *
 * Everything on this list is planned, and nothing on it exists. That is stated by
 * the same word in the same column in the same face for all three, so the
 * difference is legible in one pass and cannot be talked around by copy. The word
 * is ink weight, never a badge and never a colour: teal means live in this system,
 * and spending it on a status word would make "planned" read as a failure. When
 * one of these ships its word becomes "available" and is set in full ink.
 *
 * No dates and no ordering, anywhere. No email capture pretending to be a
 * waitlist. No logos and no third-party marks of any kind. No counts of anybody
 * using this.
 *
 * ==== one width, not two ==================================================
 *
 * A headline, three rows and two paragraphs. There is no phone edition of this
 * page because there is no phone difference in it: no keyboard eating the
 * viewport, no affordance without a touch equivalent, no action that has to reach
 * a thumb. What it has is a measure problem, which is a layout that holds at 390
 * rather than a second composition.
 */

export const Route = createFileRoute("/integrations")({
  component: Integrations,
});

/**
 * What is true about one integration right now.
 *
 * Two values, because there are only two things this page is allowed to say: the
 * thing exists and you can use it, or it does not. Anything between those two
 * would be a date or an ordering wearing a different word.
 */
type Status = "available" | "planned";

interface Integration {
  body: string;
  name: string;
  status: Status;
}

const INTEGRATIONS: readonly Integration[] = [
  {
    body: "Type /ss in any channel. You get a private window to type the secret into, and the finished link posts itself back to the channel. The bot never receives what you typed.",
    name: "Slack",
    status: "planned",
  },
  {
    body: "Pipe a file or a password out of a terminal and get a link back. The encrypting happens on your machine, the same way it happens in a tab, so a server you do not control is never in the middle.",
    name: "Command line",
    status: "planned",
  },
  {
    body: "Select a secret anywhere on your Mac, right-click, and it becomes a one-time link, in place or on your clipboard. The encrypting happens on your machine, so nothing sits in the middle at all.",
    name: "macOS",
    status: "planned",
  },
];

/*
 * One row of the inventory.
 *
 * The status is not a badge, a pill or a colour. It is which ink one word is set
 * in, at one size, in one column, so a reader can sort the page without reading a
 * sentence.
 */
function Item({
  name,
  status,
  first,
  children,
}: {
  name: string;
  status: Status;
  first: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-5 py-5 md:px-6 md:py-6",
        !first && "border-hairline border-t"
      )}
    >
      <div className="flex items-baseline gap-3">
        <h2 className="font-sans font-semibold text-body text-ink">{name}</h2>
        <span
          className={cn(
            "font-mono text-meta lowercase",
            status === "available" ? "text-ink" : "text-ink-faint"
          )}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 max-w-[560px] font-sans text-ink-muted text-small">
        {children}
      </p>
    </div>
  );
}

function Integrations() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-[420px] [background:var(--wash-accent)] md:h-[560px]"
      />

      <SiteNav current="Integrations" />

      <main className="relative px-5 md:px-16">
        <div className="mx-auto max-w-[1000px]">
          <header className="pt-12 pb-10 md:pt-[64px] md:pb-12">
            <h1 className="max-w-[980px] text-balance font-display text-display-sm text-ink-strong md:text-display">
              Send a secret from where you{" "}
              <span className="text-accent">already</span> are.
            </h1>
            {/* The constraint, immediately, because it is the thing an
             * integrations page is most tempted to fudge. */}
            <p className="mt-5 max-w-[560px] font-sans text-body text-ink-muted md:mt-7">
              A secret is still typed and locked in a browser tab, because that
              is the only place the key can exist without us seeing it. What an
              integration changes is where the errand starts and where the
              finished link lands.
            </p>
          </header>

          <Panel className="overflow-hidden">
            {INTEGRATIONS.map((integration, at) => (
              <Item
                first={at === 0}
                key={integration.name}
                name={integration.name}
                status={integration.status}
              >
                {integration.body}
              </Item>
            ))}
          </Panel>

          {/* The two paragraphs that keep `planned` from being a promise. No
           * dates, no order, and nothing to sign up to: the changelog is the only
           * notification this product has, and it is a real one. */}
          <p className="mt-6 max-w-[680px] font-sans text-ink-muted text-small md:mt-7">
            None of these three is a waitlist, and none of them has a date. They
            are the next things we want to build, written down here so you can
            see what is real today. When one of them ships it turns up on this
            page and in the{" "}
            <TextLink href={LINKS.changelog} {...OUTBOUND}>
              changelog
            </TextLink>
            .
          </p>

          <p className="mt-4 max-w-[680px] font-sans text-ink-muted text-small">
            Running your own instance? None of these will be gated, and each one
            will point at whatever server you run, with your own branding. That
            is the same rule the rest of the product follows.{" "}
            <TextLink href={LINKS.selfHosting} {...OUTBOUND}>
              Self-hosting docs
            </TextLink>
            .
          </p>

          <footer className="mt-12 border-hairline border-t py-10 md:mt-16 md:py-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
              <RouteLink
                className="inline-flex items-center gap-2 text-small"
                to="/"
                tone="quiet"
                viewTransition
              >
                Send a secret
                <Icon name="arrow-right" size={13} />
              </RouteLink>
              <TextLink
                className="text-small"
                href={LINKS.whyAgpl}
                tone="quiet"
                {...OUTBOUND}
              >
                Open source under AGPLv3
              </TextLink>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
