import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { buttonVariants } from "../ui/button";
import { Icon } from "../ui/icon";
import { LinkSpecimen } from "../ui/link-specimen";
import { Panel } from "../ui/panel";
import { SiteNav } from "../ui/site-nav";
import { TextLink } from "../ui/text-link";

/*
 * securesend.dev/integrations/macos is the page somebody lands on with the secret
 * already on screen, in a window that is not a browser.
 *
 * ==== the ten seconds this page has =======================================
 *
 * The reader here is not asking what a one-time link is. They are asking what an
 * app that can be handed their selection does with it, which is a question about
 * a machine they own rather than about a service. So the answer above the fold is
 * a path rather than an adjective: the text is read on the Mac, sealed on the Mac
 * with CryptoKit, and the only thing that leaves is bytes the server cannot read.
 * Below that is the evidence in the order this reader asks for it: what a
 * right-click actually does, the two ways in that need no selection, what leaves
 * the machine, and the source to read before installing anything.
 *
 * ==== the claims rule, and the one sentence that has to stay conditional ===
 *
 * Replacement is the trick this page is for and it is the claim most likely to be
 * over-read, because it depends on the app the reader happens to be standing in
 * rather than on us: macOS offers a selection back to the host through Services
 * and the host decides whether to take it. So replacement is written with that
 * condition attached every time it is claimed, and the clipboard entry is on the
 * page as the answer rather than as a footnote. No third-party app is named as
 * one where it works, because that is a promise about somebody else's software.
 *
 * No badge, no logo, no download count, no App Store mark, and no date on
 * anything.
 *
 * ==== the menu, drawn in this product's own ink ===========================
 *
 * The right-click menu is quoted rather than screenshotted, in this system's
 * palette rather than the platform's. A screenshot of a menu is a picture of a
 * font and a chrome nobody here chose, it ages with every release of the OS, and
 * the two entries in it are strings the app bundle actually registers, so a
 * picture that drifts from them is a picture that lies. The finished link is the
 * one line drawn by LinkSpecimen, the same component the other two integration
 * pages show a link with, because it is the same string doing the same job.
 *
 * ==== one width, not two ==================================================
 *
 * Prose, three steps, a quoted menu, two lists. Nothing here is a keyboard
 * composition or a drag, so there is no phone edition, only a measure that has to
 * hold at 390. The one string that could take the document sideways is the link,
 * and it is drawn by the component that knows where to break it.
 */

export const Route = createFileRoute("/integrations_/macos")({
  component: IntegrationsMacos,
});

/**
 * The example link, the same one the other integration pages show.
 *
 * One example secret across the product, so a reader moving between the pages is
 * looking at the same thing twice rather than wondering what changed.
 */
const LINK = "securesend.dev/s/7hK2mQ#k3xRv9LpQe2mAw";

/* The homepage's step, in the same shapes, because this is the same explanation
 * told for one right-click instead of for the web. A second visual grammar for
 * "how it works" would be this page inventing a house style of its own. */
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

/* A key press, in the face this product sets a link and a status word in. Not a
 * drawn key cap, which is furniture: the glyphs are the ones already printed on
 * the hardware. Both of them sit outside the mono subset that ships, so they are
 * drawn by the reader's own system, which on the machine this page is about is
 * where they are drawn correctly anyway. */
function Keys({ children }: { children: string }) {
  return (
    <span className="font-mono text-[14px] text-ink leading-[1.55] tracking-tight">
      {children}
    </span>
  );
}

/* The security page's two-column fact list, same shapes and the same two icons: a
 * lock for what is handed over and the crossed eye for what is never seen. */
function Facts({
  heading,
  tone,
  items,
}: {
  heading: string;
  tone: "sends" | "never";
  items: readonly string[];
}) {
  return (
    <div className="flex-1">
      <h3 className="font-mono text-ink-faint text-meta lowercase">
        {heading}
      </h3>
      <ul className="mt-3 flex flex-col gap-2.5 md:mt-4 md:gap-3">
        {items.map((item) => (
          <li
            className="flex items-start gap-2.5 font-sans text-ink-muted text-small"
            key={item}
          >
            <Icon
              className={cn(
                "mt-0.5 shrink-0",
                tone === "sends" ? "text-ink-faint" : "text-accent"
              )}
              name={tone === "sends" ? "lock" : "eye-off"}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SENDS = [
  "The sealed bytes, and the random iv they were sealed with. AES-256-GCM ran in CryptoKit on this Mac before the request was made.",
  "An id the app generated, and the 24 hour expiry this path fixes. The server generates neither.",
  "Nothing else. There is no account, no API key and no sign-in anywhere in the app.",
] as const;

const NEVER = [
  "The secret. It is read from the selection, the clipboard or the file, and sealed before anything is sent.",
  "The key. It is made on this Mac and lives after the # in the link, which no request carries.",
  "The name of a file. It is sealed inside the envelope with the bytes, because this is the same envelope a tab writes.",
  "Anything to anyone else. The app makes one request, to the instance the link comes back from, and nothing in the path is a third party.",
] as const;

function IntegrationsMacos() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-[480px] [background:var(--wash-accent)] md:h-[720px]"
      />

      <SiteNav />

      <main className="relative px-5 md:px-16">
        <div className="mx-auto max-w-[1000px]">
          <header className="pt-12 pb-12 md:pt-[72px] md:pb-20">
            <h1 className="max-w-[980px] text-balance font-display text-display-sm text-ink-strong md:text-display">
              Right-click a secret and it{" "}
              <span className="text-accent">becomes</span> a link.
            </h1>
            <p className="mt-5 max-w-[620px] font-sans text-body text-ink-muted md:mt-7">
              A menu bar app. Select the secret wherever it already is,
              right-click, and the selection is replaced by a one-time link. The
              sealing happens on your Mac in CryptoKit, Apple's own cryptography
              framework, and the key travels only in the part of the link after
              the <span className="text-accent">#</span>, which no request
              carries.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-9">
              <a
                className={cn(buttonVariants({ variant: "primary" }), "gap-2")}
                href={LINKS.macosRelease}
                {...OUTBOUND}
              >
                Download for macOS
                <Icon name="arrow-right" size={13} />
              </a>
              <RouteLink
                className="text-small"
                to="/security"
                tone="quiet"
                viewTransition
              >
                How the encryption works
              </RouteLink>
            </div>

            {/* The two things that decide whether a first press works at all:
             * whether the OS is new enough to run it, and whether the OS will
             * let it open. Both belong before the download rather than after. */}
            <p className="mt-6 max-w-[520px] font-sans text-ink-faint text-small">
              It needs macOS 14 or newer. The build is signed and notarised, so
              macOS opens it rather than refusing it as unidentified, and there
              is nothing to configure and no account to make.
            </p>
          </header>

          {/* ---- the mechanism ---------------------------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What a right-click does
            </h2>

            <div className="mt-8 flex flex-col gap-6 md:mt-12 md:flex-row md:gap-10">
              <Step heading="The menu is already there" index="01">
                The app registers its entries as macOS Services, so they are in
                the menu you right-clicked rather than in a window you have to
                go and find. Nothing has to be open and nothing has to be in
                front.
              </Step>
              <Step heading="Your Mac does the locking" index="02">
                The app makes a key, seals the text with AES-256-GCM through
                CryptoKit and sends the result. Same algorithm as the tab, same
                envelope, done on the device the secret was already on.
              </Step>
              <Step heading="The link takes its place" index="03">
                Where the app you are in takes the selection back, which is the
                standard Services hand-back, the link is simply there instead of
                the secret. Where it does not, one paste finishes the job.
              </Step>
            </div>

            <div className="mt-8 flex flex-col gap-8 md:mt-12 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1">
                {/* The menu, word for word as the app bundle registers the two
                 * entries, set in this product's own ink rather than the
                 * platform's. */}
                <Panel className="px-5 py-4 md:px-6 md:py-5">
                  <span className="font-mono text-ink-faint text-meta lowercase">
                    services
                  </span>
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="font-sans text-body text-ink">
                      Replace with SecureSend link
                    </p>
                    <p className="font-sans text-body text-ink">
                      Copy as SecureSend link
                    </p>
                  </div>
                  <div className="mt-4 rounded-inner bg-surface-sunken px-3 py-2.5">
                    <LinkSpecimen value={LINK} />
                  </div>
                  <p className="mt-3 font-sans text-ink-muted text-small">
                    expires in 24 hours · one view
                  </p>
                </Panel>
              </div>

              <div className="min-w-0 flex-1">
                <p className="max-w-[460px] font-sans text-body text-ink-muted">
                  Two entries, and that is the whole interface. The first one
                  puts the link where the secret was. The second exists because
                  replacing a selection needs the app you are in to accept the
                  result macOS offers it, and not every app does: there the link
                  goes to your clipboard instead and one paste finishes the job.
                </p>
                <p className="mt-4 max-w-[460px] font-sans text-body text-ink-muted md:mt-5">
                  A right-click has no screen to choose an expiry on, so this
                  path fixes one. The link lasts 24 hours, or until the first
                  view, whichever comes first.
                </p>
              </div>
            </div>

            {/* The caveat, full width, under the thing that causes it: the link
             * is now somewhere the sender does not own. */}
            <Panel className="mt-8 px-5 py-4 md:mt-12 md:px-6 md:py-5">
              <p className="max-w-[720px] font-sans text-body text-ink">
                Anyone holding the whole link can open the secret. The link{" "}
                <span className="text-accent">is</span> the key, and wherever
                you leave it is now holding it.
              </p>
              <div className="mt-4 rounded-inner bg-surface-sunken px-3 py-2.5 md:bg-transparent md:px-0 md:py-0">
                <LinkSpecimen tone="anatomy" value={LINK} />
              </div>
              <p className="mt-4 max-w-[720px] font-sans text-body text-ink-muted md:mt-5">
                That is exactly why it burns on the first view and expires
                within the day either way: the window in which a link sitting in
                somebody's message history is worth anything is as short as we
                can make it.
              </p>
            </Panel>
          </section>

          {/* ---- the two ways in that start from no selection ---------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              When there is nothing on screen to select
            </h2>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-16">
              <div className="flex flex-1 flex-col">
                <h3 className="font-sans font-semibold text-body text-ink">
                  From the clipboard
                </h3>
                <p className="mt-3 max-w-[420px] font-sans text-ink-muted text-small">
                  Generate from clipboard is in the menu bar menu, and{" "}
                  <Keys>⌃⇧C</Keys> does the same thing without the mouse:
                  whatever you last copied is a link by the time you paste it.
                  The hotkey is remappable in the app's settings.
                </p>
              </div>

              <div className="flex flex-1 flex-col">
                <h3 className="font-sans font-semibold text-body text-ink">
                  From a file in Finder
                </h3>
                <p className="mt-3 max-w-[420px] font-sans text-ink-muted text-small">
                  Right-click a file and it goes the same way a selection does,
                  up to 10 MB, which is the envelope this instance accepts
                  rather than a limit the app invents. One link, one view, and
                  the name of the file is sealed with it.
                </p>
              </div>
            </div>
          </section>

          {/* ---- what actually leaves the machine ---------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What leaves your Mac
            </h2>

            <p className="mt-5 max-w-[680px] font-sans text-body text-ink-muted md:mt-6">
              Four moves, and no other party in any of them: the selection is
              read here, sealed here, the sealed bytes are posted to the
              instance, and the link comes back into place. A secret pasted into
              a hosted window is text on somebody else's server. This one is
              sealed bytes before it leaves the machine.
            </p>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-16">
              <Facts heading="sends" items={SENDS} tone="sends" />
              <Facts heading="never sends" items={NEVER} tone="never" />
            </div>
          </section>

          {/* ---- the source, which is the point of shipping it this way ------ */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="font-sans text-heading text-ink-strong">
              Read it before you install it
            </h2>

            <div className="mt-8 flex flex-col items-start gap-6 md:mt-10">
              <p className="max-w-[620px] font-sans text-body text-ink-muted">
                An app that can be handed your selection is exactly the kind you
                should want to read first. It is open source, in a repository of
                its own, and the part worth reading is the code that makes a
                key, seals the bytes and posts them.
              </p>
              <a
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "gap-2"
                )}
                href={LINKS.macos}
                {...OUTBOUND}
              >
                The app's source
                <Icon name="arrow-right" size={13} />
              </a>
            </div>
          </section>

          <footer className="border-hairline border-t py-10 md:py-12">
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
