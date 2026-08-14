import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { buttonVariants } from "../ui/button";
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
 * A secret is locked on the device it was already on, and that is not a limitation
 * an integration gets to route around: the sending device is the only place the
 * key can exist without us. So an integration moves the beginning and the end of
 * the errand and nothing in between, and the page says that above the list rather
 * than under it.
 *
 * ==== the honesty rules this page is built on =============================
 *
 * All three of these exist today. That is stated by the same word in the same
 * column in the same face for every row, so what is true is legible in one pass
 * and cannot be talked around by copy. The word is ink weight, never a badge and
 * never a colour: teal means live in this system, and spending it on a status
 * word would make "planned" read as a failure the first time a row arrives
 * unbuilt. `available` is full ink and `planned` is faint, and a row carries a
 * press only where there is a page behind it.
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

/** The detail page behind a row, for the rows that have one. */
type Detail =
  | "/integrations/cli"
  | "/integrations/macos"
  | "/integrations/slack";

interface Integration {
  body: string;
  name: string;
  /** Absent on a row that is planned: there is nothing yet to explain. */
  page?: Detail;
  status: Status;
}

const INTEGRATIONS: readonly Integration[] = [
  {
    body: "Type /ss in any channel. You get a private window to type the secret into, and the finished link posts itself back to the channel. The bot never receives what you typed.",
    name: "Slack",
    page: "/integrations/slack",
    status: "available",
  },
  {
    body: "Pipe a file or a password out of a terminal and get a link back. The encrypting happens on your machine, the same way it happens in a tab, so a server you do not control is never in the middle.",
    name: "Command line",
    page: "/integrations/cli",
    status: "available",
  },
  {
    body: "Select a secret anywhere on your Mac, right-click, and it becomes a one-time link, in place or on your clipboard. The encrypting happens on your machine, so nothing sits in the middle at all.",
    name: "macOS",
    page: "/integrations/macos",
    status: "available",
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
  action,
  children,
}: {
  name: string;
  status: Status;
  first: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        /* Wrapped on a measure rather than at a breakpoint: the action sits
         * beside the row where there is room for it and drops under the row where
         * there is not, which at 390 is every time. */
        "flex flex-wrap items-start justify-between gap-x-10 gap-y-4 px-5 py-5 md:px-6 md:py-6",
        !first && "border-hairline border-t"
      )}
    >
      <div className="min-w-[260px] flex-1">
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
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
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
              A secret is still locked on the device it was already on, in a
              tab, a terminal or a menu bar, because that is the only place the
              key can exist without us seeing it. What an integration changes is
              where the errand starts and where the finished link lands.
            </p>
          </header>

          <Panel className="overflow-hidden">
            {INTEGRATIONS.map((integration, at) => (
              <Item
                action={
                  integration.page ? (
                    /* The router's own link rather than RouteLink, which pairs
                     * the quiet link's look with the right tag. This one wears
                     * the button's look instead, so it takes the class directly
                     * rather than fighting the underline off the other one. */
                    <Link
                      className={cn(
                        buttonVariants({ size: "sm", variant: "secondary" }),
                        "gap-2"
                      )}
                      to={integration.page}
                      viewTransition
                    >
                      How it works
                      <Icon name="arrow-right" size={13} />
                    </Link>
                  ) : null
                }
                first={at === 0}
                key={integration.name}
                name={integration.name}
                status={integration.status}
              >
                {integration.body}
              </Item>
            ))}
          </Panel>

          {/* The two paragraphs that keep this page from reading as a roadmap.
           * No date, no order, and nothing to sign up to: the changelog is the
           * only notification this product has, and it is a real one. */}
          <p className="mt-6 max-w-[680px] font-sans text-ink-muted text-small md:mt-7">
            Nothing here is a waitlist. All three are built and you can use them
            today, and whatever joins them turns up on this page and in the{" "}
            <TextLink href={LINKS.changelog} {...OUTBOUND}>
              changelog
            </TextLink>
            .
          </p>

          <p className="mt-4 max-w-[680px] font-sans text-ink-muted text-small">
            Running your own instance? The command takes one variable to point
            at whatever server you run, and the Slack app is a manifest you
            paste into your own workspace, with your own branding. None of it is
            gated.{" "}
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
