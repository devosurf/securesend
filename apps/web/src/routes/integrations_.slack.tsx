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
 * securesend.dev/integrations/slack is the page somebody lands on after searching
 * for a safe way to hand a colleague a password in Slack.
 *
 * ==== the ten seconds this page has =======================================
 *
 * A stranger arrives mid-errand: a colleague needs a credential and pasting it in
 * the channel is obviously wrong. The page has to answer one question before it
 * earns a second look, and the answer is a mechanism rather than an adjective:
 * the app never receives the secret, because the secret is never typed in Slack.
 * Above the fold is that sentence and the press that acts on it. Below it is the
 * evidence, in the order a sceptic asks for it: what happens, what the channel
 * actually gets, what the app is allowed to do in the workspace, and how to run
 * the whole thing yourself instead.
 *
 * ==== the claims rule, harder here than on the homepage ===================
 *
 * This page is read by somebody deciding whether to put an app in a workspace
 * they may not own, so:
 *
 *   the caveat is at full width in the section about the thing that causes it.
 *   The link is the key and the channel is now holding it. It sits directly under
 *   the picture of the post rather than in a footnote, because that post is the
 *   moment the caveat becomes true.
 *
 *   the scope is named. `commands` alone, in the same pair of lists as the things
 *   the app never receives, so "what am I granting" and "what am I protected
 *   from" are read in one pass. Posting needs no scope: the browser delivers the
 *   link through the one-time reply handle Slack attaches to the sender's own
 *   /ss. If a later feature ever posts by app authority instead, `chat:write`
 *   joins the manifest and these words are wrong.
 *
 *   no badge, no logo, no customer count, no testimonial, and no date on
 *   anything.
 *
 * ==== the channel, drawn in this product's own ink ========================
 *
 * The post is quoted rather than screenshotted, and it is set in this system's
 * palette rather than Slack's. Two reasons. Slack's colours and the official Add
 * to Slack asset are Slack's to grant, and nothing here loads or imitates another
 * brand's marks. And the words in that panel are the words apps/web/src/slack
 * actually sends, so a picture that drifts from them is a picture that lies.
 *
 * ==== one width, not two ==================================================
 *
 * Prose, three steps, two lists and a quoted message. No keyboard, no drag and
 * drop, no share sheet, and the primary action is a link, so there is no phone
 * composition here, only a measure that has to hold at 390. Every multi-column
 * row stacks rather than squeezing.
 */

export const Route = createFileRoute("/integrations_/slack")({
  component: IntegrationsSlack,
});

/**
 * The example link, the same one the security page shows.
 *
 * One example secret across the product, so a reader moving between the two pages
 * is looking at the same thing twice rather than wondering what changed.
 */
const LINK = "securesend.dev/s/7hK2mQ#k3xRv9LpQe2mAw";

/* The homepage's step, in the same shapes, because this is the same explanation
 * told for one channel instead of for the web. A second visual grammar for "how
 * it works" would be this page inventing a house style of its own. */
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

/* The security page's two-column fact list, same shapes and the same two icons: a
 * lock for what is granted and the crossed eye for what is never seen. */
function Facts({
  heading,
  tone,
  items,
}: {
  heading: string;
  tone: "asks" | "never";
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
                tone === "asks" ? "text-ink-faint" : "text-accent"
              )}
              name={tone === "asks" ? "lock" : "eye-off"}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ASKS = [
  "commands, so it can answer /ss. That is the whole grant.",
  "Nothing for posting. The finished link travels from your browser through the one-time reply handle Slack attaches to your own /ss, and that handle expires half an hour later.",
  "The token Slack mints at install is never used by this flow, and with no other scope there is nothing it could read.",
] as const;

const NEVER = [
  "The secret. It is typed in a SecureSend tab and never in Slack.",
  "The key. It lives after the # in the link and never reaches a server.",
  "The password, if you set one. There is nothing here to check it against.",
  "Your channels, your history or your files. It cannot read the channel it posts in.",
] as const;

/**
 * The install handshake, worn twice on this page and identical both times.
 *
 * An anchor rather than a button, because it is a real destination: it leaves the
 * app for this instance's own OAuth route and comes back through Slack. Same tab,
 * for the same reason a sign-in is not a popup.
 */
function Install() {
  return (
    <a
      className={cn(buttonVariants({ variant: "primary" }), "gap-2")}
      href={LINKS.slackInstall}
    >
      Add to Slack
      <Icon name="arrow-right" size={13} />
    </a>
  );
}

function IntegrationsSlack() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-[480px] [background:var(--wash-accent)] md:h-[720px]"
      />

      <SiteNav current="Integrations" />

      <main className="relative px-5 md:px-16">
        <div className="mx-auto max-w-[1000px]">
          <header className="pt-12 pb-12 md:pt-[72px] md:pb-20">
            <h1 className="max-w-[980px] text-balance font-display text-display-sm text-ink-strong md:text-display">
              <span className="text-accent">Never</span> paste a password in
              Slack again.
            </h1>
            <p className="mt-5 max-w-[600px] font-sans text-body text-ink-muted md:mt-7">
              Type /ss in any channel. You get a private window to type the
              secret into, your browser locks it before it leaves, and only the
              finished link posts back. The app never receives what you typed,
              and our server only ever holds bytes it cannot read.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-9">
              <Install />
              <RouteLink
                className="text-small"
                to="/security"
                tone="quiet"
                viewTransition
              >
                How the encryption works
              </RouteLink>
            </div>

            {/* The one piece of friction worth naming up front, because it is the
             * reason a lot of these presses fail: most workspaces put app installs
             * behind an admin. Saying so turns a dead end into an errand the
             * reader can actually run. */}
            <p className="mt-6 max-w-[520px] font-sans text-ink-faint text-small">
              Adding an app needs permission in your workspace. If you do not
              have it, this is the page to send to whoever does.
            </p>
          </header>

          {/* ---- the mechanism ---------------------------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What happens when you type /ss
            </h2>

            <div className="mt-8 flex flex-col gap-6 md:mt-12 md:flex-row md:gap-10">
              <Step heading="Nobody sees the command" index="01">
                A slash command is not posted, so the channel never carries it.
                The app answers you with a private message and one button, and
                that reply is visible to you and nobody else.
              </Step>
              <Step heading="Your browser does the locking" index="02">
                The button opens a SecureSend window. You type the secret there,
                your tab makes a key and encrypts with AES-256-GCM, and the key
                stays in the part of the link after the{" "}
                <span className="text-accent">#</span>, which browsers never
                send to a server.
              </Step>
              <Step heading="The link posts itself back" index="03">
                One press both creates the secret and puts the finished link in
                the channel you started from. It opens once, and after that it
                is gone for everybody, you included.
              </Step>
            </div>
          </section>

          {/* ---- the channel, and the caveat the channel causes --------------
           * The quoted post and the caveat are one section on purpose. The post
           * is the moment the link stops being the sender's and becomes the
           * room's, so the sentence admitting what a link is belongs directly
           * under it rather than in a paragraph somebody scrolls past. */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What lands in the channel
            </h2>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1">
                {/* The post, word for word as apps/web/src/slack sends it, set in
                 * this product's own ink rather than Slack's. */}
                <Panel className="px-5 py-4 md:px-6 md:py-5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-sans font-semibold text-ink text-small">
                      SecureSend
                    </span>
                    <span className="font-mono text-ink-faint text-meta lowercase">
                      app
                    </span>
                  </div>
                  <p className="mt-3 font-sans text-body text-ink">
                    Marta shared a one-time secret
                  </p>
                  <div className="mt-2 rounded-inner bg-surface-sunken px-3 py-2.5">
                    <LinkSpecimen value={LINK} />
                  </div>
                  <p className="mt-3 font-sans text-ink-muted text-small">
                    expires in 24 hours · one view
                  </p>
                </Panel>
              </div>

              <div className="min-w-0 flex-1">
                <p className="max-w-[460px] font-sans text-body text-ink-muted">
                  That post is everything the channel gets: a link, how long it
                  lasts, and the fact that it opens once.
                </p>
                <p className="mt-4 max-w-[460px] font-sans text-body text-ink-muted md:mt-5">
                  It carries no buttons, and that is deliberate. Slack hands an
                  app the whole message a button was pressed on, so a button
                  under this link would put the key on our server the first time
                  anybody pressed it. The controls to extend or burn the secret
                  are a separate private message, and that one carries no link
                  at all.
                </p>
              </div>
            </div>

            {/* The caveat, full width, under the thing that causes it. */}
            <Panel className="mt-8 px-5 py-4 md:mt-12 md:px-6 md:py-5">
              <p className="max-w-[720px] font-sans text-body text-ink">
                Anyone holding the whole link can open the secret. The link{" "}
                <span className="text-accent">is</span> the key, and once it is
                posted the room is holding it.
              </p>
              <div className="mt-4 rounded-inner bg-surface-sunken px-3 py-2.5 md:bg-transparent md:px-0 md:py-0">
                <LinkSpecimen tone="anatomy" value={LINK} />
              </div>
              <p className="mt-4 max-w-[720px] font-sans text-body text-ink-muted md:mt-5">
                That is exactly why it burns on the first view and expires
                within hours either way: the window in which a link in a channel
                is worth anything is as short as we can make it. If the channel
                is the part you do not trust, set a password on the secret and
                say it somewhere else.
              </p>
            </Panel>
          </section>

          {/* ---- the permissions question ----------------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What the app can do in your workspace
            </h2>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-16">
              <Facts heading="asks for" items={ASKS} tone="asks" />
              <Facts heading="never receives" items={NEVER} tone="never" />
            </div>
          </section>

          {/* ---- both ways to run it, side by side --------------------------
           * Equal columns, equal weight, and the self-host half is not the
           * consolation prize: the core action is never paywalled and a
           * self-hoster keeps their own branding for free. A page that buried the
           * second column would be quietly contradicting that. */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="font-sans text-heading text-ink-strong">
              Two ways to run it
            </h2>

            {/* Both columns are flex and both actions are pushed to the bottom of
             * their own column, so the two presses land on one line however long
             * the paragraphs above them run. A hosted button sitting higher than
             * the self-host one would rank them. */}
            <div className="mt-8 flex flex-col items-stretch gap-8 md:mt-10 md:flex-row md:gap-16">
              <div className="flex flex-1 flex-col">
                <h3 className="font-sans font-semibold text-body text-ink">
                  Our instance
                </h3>
                <p className="mt-3 max-w-[420px] font-sans text-ink-muted text-small">
                  One press, one permission screen, and /ss works in every
                  channel you can post in. Nothing to configure and nothing to
                  host. It runs the same container a self-hoster gets.
                </p>
                <div className="mt-auto flex pt-5 md:pt-6">
                  <Install />
                </div>
              </div>

              <div className="flex flex-1 flex-col">
                <h3 className="font-sans font-semibold text-body text-ink">
                  Your own instance
                </h3>
                <p className="mt-3 max-w-[420px] font-sans text-ink-muted text-small">
                  Point a Slack app of your own at whatever server you run. The
                  manifest ships in the repository: paste it into Slack's app
                  builder, give it your own name and icon, and the command
                  behaves exactly as it does here. No key, no tier, no asking
                  us.
                </p>
                <div className="mt-auto flex pt-5 md:pt-6">
                  <a
                    className={cn(
                      buttonVariants({ variant: "secondary" }),
                      "gap-2"
                    )}
                    href={LINKS.slackApp}
                    {...OUTBOUND}
                  >
                    Slack setup docs
                    <Icon name="arrow-right" size={13} />
                  </a>
                </div>
              </div>
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
