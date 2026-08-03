import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { buttonVariants } from "../ui/button";
import { Icon } from "../ui/icon";
import { TextLink } from "../ui/text-link";
import { Wordmark } from "../ui/wordmark";

/*
 * securesend.dev/ is the whole public page, and the whole sender's side.
 *
 * The create page is the homepage. That is the product's single most important
 * structural decision and everything here follows from it: the first thing a
 * stranger sees is the thing they came to use, and the ten seconds they spend on
 * it is the entire product. The composer itself, and the sender's device memory
 * under it, arrive with the seal-and-send work. What is here is everything around
 * them: the header, the page under the fold, and the footer.
 *
 * ==== the below-fold ======================================================
 *
 * Three sections and a footer, and each one is load-bearing rather than marketing
 * furniture:
 *
 *   how it works        the mechanism, because the mechanism IS the pitch
 *   what we hold        two lists, and the caveat that makes the label honest
 *   what we don't say   the claims we are not making, named out loud
 *
 * The claims rule is binding here and it is the reason the third section exists
 * at all: a product whose pitch is "trust the mechanism" cannot also be vague
 * about its limits. "End-to-end encrypted" appears exactly once on this page, in
 * the same paragraph as the sentence saying anyone holding the whole link can open
 * the secret. No audit, no SOC 2 and no HIPAA are claimed, because none of them
 * are true.
 *
 * ==== two widths, one page ================================================
 *
 * The design fixes both a desk composition and a 390 one, and below the fold they
 * differ in more than layout: the phone edition trims sentences the desk has room
 * for. So the shared prose is written once and the deltas are marked with AtDesk
 * and OnPhone rather than the whole page being written twice. Where the
 * arrangement itself diverges, in the footer's link groups, both arrangements are
 * present and one is hidden, because a two-column grouping and a wrapped row are
 * not the same element with different padding.
 */

export const Route = createFileRoute("/")({
  component: Home,
});

/** Prose the desk has room for and the phone does not. */
function AtDesk({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline">{children}</span>;
}

/** The phone's shorter way of saying the same thing. */
function OnPhone({ children }: { children: ReactNode }) {
  return <span className="md:hidden">{children}</span>;
}

const STEPS = [
  {
    body: (
      <>
        Your browser makes a key, encrypts the secret with it, and sends us the
        result.{" "}
        <AtDesk>AES-256-GCM, through the browser's own Web Crypto. </AtDesk>The
        plaintext never leaves the tab.
      </>
    ),
    heading: "You paste it in",
    index: "01",
  },
  {
    body: (
      <>
        The key is the part after the <span className="text-accent">#</span>.
        Browsers never send that part to a server, so we hold{" "}
        <OnPhone>bytes we cannot read.</OnPhone>
        <AtDesk>
          ciphertext we cannot read and you hold the only thing that opens it.
        </AtDesk>
      </>
    ),
    heading: "You get a link",
    index: "02",
  },
  {
    body: (
      <>
        The first reveal decrypts in their browser and deletes our copy in the
        same moment. After that the link is dead for everybody
        <AtDesk>, you included</AtDesk>.
      </>
    ),
    heading: "They open it once",
    index: "03",
  },
] as const;

interface Hold {
  body: ReactNode;
  deskOnly?: boolean;
  id: string;
}

const KEPT: readonly Hold[] = [
  { body: "The encrypted bytes, which we cannot decrypt.", id: "bytes" },
  { body: "An expiry, a status, and the size.", id: "shape" },
  { body: "Timestamps: made, expires, used.", deskOnly: true, id: "stamps" },
];

const NEVER: readonly Hold[] = [
  {
    body: "The key. It lives in the link fragment and stays in the browser.",
    id: "key",
  },
  {
    body: (
      <>
        The password, if you set one.
        <AtDesk> There is no verifier to check it against.</AtDesk>
      </>
    ),
    id: "password",
  },
  {
    body: "The contents, the filenames, or which address opened it.",
    id: "contents",
  },
];

const CLAIMS = [
  {
    body: (
      <>
        Nobody outside this project has reviewed the cryptography. The code is
        open so you don't have to take our word for either part.
      </>
    ),
    id: "audit",
    lead: "No audit, no SOC 2, no HIPAA.",
  },
  {
    body: (
      <>
        Lose the link and the secret is unreadable, permanently, including by
        us.
        <AtDesk> That is the design working, not failing.</AtDesk>
      </>
    ),
    id: "recovery",
    lead: "We can't recover anything.",
  },
  {
    body: (
      <>
        We never see it, so there is nothing here to verify it against
        <OnPhone>.</OnPhone>
        <AtDesk> and no way to send a reset.</AtDesk>
      </>
    ),
    id: "password",
    lead: "A password can't be checked or reset.",
  },
  {
    body: (
      <>
        Not who used it, not whether they could read it, and not what was
        inside.
        <AtDesk> Your history lives in your browser, not our database.</AtDesk>
      </>
    ),
    id: "used",
    lead: "We see that a link was used.",
  },
] as const;

function Step({
  index,
  heading,
  children,
}: {
  index: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 border-hairline border-t pt-4 md:pt-5">
      <span className="font-mono text-ink-faint text-meta">{index}</span>
      <h3 className="mt-2 font-sans font-semibold text-body text-ink md:mt-3">
        {heading}
      </h3>
      <p className="mt-1.5 font-sans text-ink-muted text-small md:mt-2">
        {children}
      </p>
    </div>
  );
}

function Holds({
  heading,
  tone,
  items,
}: {
  heading: string;
  tone: "kept" | "never";
  items: readonly Hold[];
}) {
  return (
    <div className="flex-1">
      <h3 className="font-sans font-semibold text-body text-ink">{heading}</h3>
      <ul className="mt-3 flex flex-col gap-2.5 md:mt-4">
        {items.map((item) => (
          <li
            className={cn(
              "items-start gap-2.5 font-sans text-ink-muted text-small",
              item.deskOnly ? "hidden md:flex" : "flex"
            )}
            key={item.id}
          >
            <Icon
              className={cn(
                "mt-0.5 shrink-0",
                tone === "kept" ? "text-ink-faint" : "text-accent"
              )}
              name={tone === "kept" ? "lock" : "eye-off"}
            />
            {/* The row is a flex line, so the sentence has to be one item. An
             * item that is bare text beside a span becomes two, and the gap
             * meant for the icon opens up mid-sentence. */}
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
 * The seven destinations the footer carries, each written once.
 *
 * The phone wraps all seven as text links; the desk promotes the first into a
 * button and splits the rest into what stays on the site and what leaves for the
 * repository. Layout is allowed to differ between the two widths. What the product
 * tells you about itself is not, which is why both arrangements name the same
 * seven.
 */
function SourceLink() {
  return (
    <TextLink
      className="text-small"
      href={LINKS.source}
      tone="quiet"
      {...OUTBOUND}
    >
      Read the source
    </TextLink>
  );
}

function SecurityLink() {
  return (
    <RouteLink
      className="text-small"
      to="/security"
      tone="quiet"
      viewTransition
    >
      Security and threat model
    </RouteLink>
  );
}

function SelfHostingLink() {
  return (
    <TextLink
      className="text-small"
      href={LINKS.selfHosting}
      tone="quiet"
      {...OUTBOUND}
    >
      Self-hosting docs
    </TextLink>
  );
}

function WhyAgplLink() {
  return (
    <TextLink
      className="text-small"
      href={LINKS.whyAgpl}
      tone="quiet"
      {...OUTBOUND}
    >
      Why AGPL
    </TextLink>
  );
}

function ChangelogLink() {
  return (
    <TextLink
      className="text-small"
      href={LINKS.changelog}
      tone="quiet"
      {...OUTBOUND}
    >
      Changelog
    </TextLink>
  );
}

function SecurityMailLink() {
  return (
    <TextLink className="text-small" href={LINKS.security} tone="quiet">
      security@securesend.dev
    </TextLink>
  );
}

function AbuseMailLink() {
  return (
    <TextLink className="text-small" href={LINKS.abuse} tone="quiet">
      abuse@securesend.dev
    </TextLink>
  );
}

function Home() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-dvh [background:var(--wash-accent)] md:h-[900px]"
      />

      <nav className="relative flex items-center justify-between px-5 pt-7 md:px-16 md:pt-10">
        <Wordmark />
        <div className="flex items-center gap-8">
          <RouteLink
            className="text-small"
            to="/security"
            tone="quiet"
            viewTransition
          >
            Security
          </RouteLink>
          {/* An in-page anchor: the footer is where the self-host story starts,
           * and it is on this page. */}
          <TextLink
            className="hidden text-small md:inline"
            href="#self-host"
            tone="quiet"
          >
            Self-host
          </TextLink>
        </div>
      </nav>

      <main className="relative">
        {/* The header the whole product wears, down to the line break and the
         * accented word. Only the line under it is local: it tells you what you
         * can put in the box that lands here next.
         *
         * The composer goes under this header, and the fold gets its designed
         * floor of 760px back when it does. The floor exists so that every part a
         * sender adds grows downward into room that was already there and nothing
         * above it ever moves, which is a promise about the composer. Reserving
         * that height around a headline and nothing else would just be a screen
         * of empty. */}
        <div className="flex flex-col items-center px-5 pt-9 pb-1 md:px-6 md:pt-[84px] md:pb-0">
          <div className="w-full max-w-[760px] text-center">
            <h1 className="text-balance font-display text-display-sm text-ink-strong md:text-display">
              Send a secret
              <br />
              that <span className="text-accent">disappears.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[480px] font-sans text-body text-ink-muted md:mt-7">
              Type it, paste it, or <OnPhone>add a file.</OnPhone>
              <AtDesk>
                drop a file in. It's locked in this browser before it goes
                anywhere.
              </AtDesk>
            </p>
          </div>
        </div>

        {/* ---- how it works ------------------------------------------------
         * The mechanism is the pitch. Anyone can say "secure"; the only thing
         * that separates this from a pastebin is what happens to the key, so that
         * is what the three steps are about. */}
        <section className="mt-16 border-hairline border-t px-5 pt-10 md:mt-24 md:px-16 md:py-20">
          <div className="mx-auto max-w-[1000px]">
            <h2 className="max-w-[560px] text-balance font-sans text-heading text-ink-strong">
              The key never reaches us. That's the whole design.
            </h2>

            <div className="mt-8 flex flex-col gap-6 md:mt-12 md:flex-row md:gap-10">
              {STEPS.map((step) => (
                <Step
                  heading={step.heading}
                  index={step.index}
                  key={step.index}
                >
                  {step.body}
                </Step>
              ))}
            </div>
          </div>
        </section>

        {/* ---- what we hold -------------------------------------------------
         * Two lists and the caveat. A label like end-to-end may only appear
         * within sight of the sentence admitting that whoever holds the whole
         * link can open the secret, so the two are in the same paragraph, and the
         * label appears exactly once on this page. */}
        <section className="mt-12 border-hairline border-t px-5 pt-10 md:mt-0 md:px-16 md:py-20">
          <div className="mx-auto max-w-[1000px]">
            <h2 className="font-sans text-heading text-ink-strong">
              What sits on our server
            </h2>

            <div className="mt-7 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-16">
              <Holds
                heading="Kept until it's used or expires"
                items={KEPT}
                tone="kept"
              />
              <Holds
                heading="Never stored, never logged"
                items={NEVER}
                tone="never"
              />
            </div>

            <p className="mt-8 max-w-[620px] font-sans text-body text-ink-muted md:mt-12">
              That is what end-to-end encrypted means here, and it comes with
              one honest caveat:{" "}
              <span className="text-ink">
                anyone holding the whole link can open the secret
              </span>
              . The link is the key.
              <AtDesk>
                {" "}
                Treat it like the password it carries, and send a password
                separately if it matters.
              </AtDesk>
            </p>
          </div>
        </section>

        {/* ---- what we don't say --------------------------------------------
         * A product whose pitch is "trust the mechanism" cannot be vague about
         * its limits. Every line here is a claim we are choosing not to make, and
         * the section stays until each one stops being true. */}
        <section className="mt-12 border-hairline border-t px-5 pt-10 md:mt-0 md:px-16 md:py-20">
          <div className="mx-auto max-w-[1000px]">
            <h2 className="font-sans text-heading text-ink-strong">
              What we're not claiming
            </h2>

            <div className="mt-7 grid max-w-[860px] gap-5 md:mt-10 md:grid-cols-2 md:gap-x-16 md:gap-y-7">
              {CLAIMS.map((claim) => (
                <p
                  className="font-sans text-ink-muted text-small"
                  key={claim.id}
                >
                  <span className="text-ink">{claim.lead}</span> {claim.body}
                </p>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ---- the footer, and the repository ------------------------------- */}
      <footer
        className="mt-12 border-hairline border-t px-5 pt-10 pb-10 md:mt-0 md:px-16 md:py-16"
        id="self-host"
      >
        <div className="mx-auto max-w-[1000px] md:flex md:items-end md:justify-between md:gap-10">
          <div className="md:max-w-[420px]">
            <Wordmark />
            <p className="mt-4 font-sans text-body text-ink-muted md:mt-5">
              Open source under AGPLv3. Run it yourself in one container, with
              your own branding, for nothing.
              <AtDesk> It's the same image our own instance runs.</AtDesk>
            </p>
            {/* An anchor wearing the button, not a button that navigates. The
             * look is shared through buttonVariants precisely so a destination
             * never has to pretend to be a control. */}
            <div className="mt-6 hidden items-center gap-5 md:flex">
              <a
                className={cn(
                  buttonVariants({ size: "sm", variant: "secondary" }),
                  "gap-2"
                )}
                href={LINKS.source}
                {...OUTBOUND}
              >
                Read the source
                <Icon name="arrow-right" size={13} />
              </a>
              <SelfHostingLink />
            </div>
          </div>

          {/* At 390 all seven wrap, because a column of seven tap targets is a
           * column of near-misses. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 md:hidden">
            <SourceLink />
            <SecurityLink />
            <SelfHostingLink />
            <WhyAgplLink />
            <ChangelogLink />
            <SecurityMailLink />
            <AbuseMailLink />
          </div>

          {/* At a desk the left column stays on the site or opens a mail client
           * and the right column leaves for the repository. That is the only
           * grouping five links need, and it beats hanging an outbound glyph off
           * half of them. One security link, not two: the security model and the
           * threat model are one page. */}
          <div className="hidden md:flex md:gap-16 md:pb-1">
            <div className="flex flex-col gap-2.5">
              <SecurityLink />
              <SecurityMailLink />
              <AbuseMailLink />
            </div>
            <div className="flex flex-col gap-2.5">
              <WhyAgplLink />
              <ChangelogLink />
            </div>
          </div>
        </div>

        {/* No trackers is a claim we can actually back, so it is said plainly and
         * last. Zero third-party scripts and zero analytics site-wide, which is
         * also why there is no cookie banner. */}
        <div className="mx-auto mt-8 flex max-w-[1000px] items-center justify-between border-hairline border-t pt-6 md:mt-14 md:pt-7">
          <p className="font-sans text-ink-faint text-small">
            No analytics, no third-party scripts, no cookie banner to dismiss.
          </p>
          <p className="hidden font-mono text-ink-faint text-meta md:block">
            securesend.dev
          </p>
        </div>
      </footer>
    </div>
  );
}
