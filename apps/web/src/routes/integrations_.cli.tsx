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
 * securesend.dev/integrations/cli is the page somebody lands on with a key.pem in
 * one hand and a terminal already open in the other.
 *
 * ==== the ten seconds this page has =======================================
 *
 * The reader here is not asking what a one-time link is. They are asking whether
 * the command is the same product as the tab or a looser cousin of it that sends
 * the secret somewhere and calls it encrypted. So the answer above the fold is a
 * mechanism rather than an adjective: the CLI seals and opens with the code the
 * browser runs, on Node's own Web Crypto, and the server holds bytes it cannot
 * read. Below that is the evidence in the order a terminal reader asks for it:
 * the four lines of the errand, what happens when the thing needing the secret is
 * a process rather than a person, what leaves this machine, and how to point the
 * whole thing at a server of your own.
 *
 * ==== the claims rule, and the one verb that earns a paragraph ============
 *
 * `run` is the claim on this page most likely to be over-read, so it is written
 * with its own limits attached, in the same words SKILL.md uses on the agent that
 * reads it: what it guarantees is narrow and real, the plaintext goes into a
 * child process's environment and never into a transcript, and once a secret is
 * in a context, keeping it out of logs downstream is best effort. That paragraph
 * carries the product's standing caveat too, because this is the page where a
 * link is most likely to be pasted into something that keeps history.
 *
 * No badge, no logo, no download count, no npm mark, and no date on anything.
 *
 * ==== the terminal, drawn in this product's own ink =======================
 *
 * The session is set as text in this system's mono face rather than as a
 * screenshot or a chrome-less window with three coloured dots. Two reasons. A
 * screenshot of a terminal is a picture of a font nobody here chose, and every
 * command quoted below is one a reader is going to select and copy, which a
 * picture refuses. The finished link is the one line drawn by LinkSpecimen, the
 * same component the Slack page and the security page show a link with, because
 * it is the same string doing the same job.
 *
 * ==== one width, not two ==================================================
 *
 * Prose, three steps, a session, two lists. The one thing that can push this page
 * sideways is a command line, so the commands are written with `<link>` where a
 * whole link would go, exactly as the agent skill writes them, and the only real
 * link on the page is drawn by the component that knows where to break it.
 */

export const Route = createFileRoute("/integrations_/cli")({
  component: IntegrationsCli,
});

/**
 * The example link, the same one the Slack and security pages show.
 *
 * One example secret across the product, so a reader moving between the pages is
 * looking at the same thing twice rather than wondering what changed.
 */
const LINK = "securesend.dev/s/7hK2mQ#k3xRv9LpQe2mAw";

/* The homepage's step, in the same shapes, because this is the same explanation
 * told for one terminal instead of for the web. A second visual grammar for "how
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

/*
 * One line somebody types, in the face the rest of the product sets a link in.
 *
 * The prompt is a faint `$` rather than part of the string, so what a reader
 * selects is the command and not a character their shell would choke on. The line
 * wraps at its spaces and only breaks a word that could not fit alone, which is
 * what keeps a long command from taking the document sideways at 390.
 */
function Command({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="select-none font-mono text-[14px] text-ink-faint leading-[1.55]"
      >
        $
      </span>
      <p className="min-w-0 break-words font-mono text-[14px] text-ink leading-[1.55] tracking-tight">
        {children}
      </p>
    </div>
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
  "The sealed bytes, and the random iv they were sealed with. AES-256-GCM ran on your machine before the request was made.",
  "An id your machine generated, and which of the three expiries you picked. The server generates neither.",
  "Nothing else. There is no account, no API key and no sign-in on any of these commands.",
] as const;

const NEVER = [
  "The secret. It is read from stdin, a file or --text, and sealed before anything is sent.",
  "The key. It is made on your machine and lives after the # in the link, which no request carries.",
  "The password, if you set one. The command prompts for it rather than taking it as an argument, and there is nothing on the server to check it against.",
  "The plaintext a run put in a child process. That value exists in that process and nowhere else.",
] as const;

function IntegrationsCli() {
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
              Pipe a secret out, get{" "}
              <span className="text-accent">one link</span> back.
            </h1>
            <p className="mt-5 max-w-[620px] font-sans text-body text-ink-muted md:mt-7">
              The command seals and opens with the exact code the browser runs,
              imported byte for byte, on Node's own Web Crypto. The key is made
              on your machine and travels only in the part of the link after the{" "}
              <span className="text-accent">#</span>, which no request carries,
              so our server stores bytes it cannot read.
            </p>

            <div className="mt-8 md:mt-9">
              <Panel className="max-w-[420px] px-5 py-4 md:px-6 md:py-5">
                <Command>npm install -g securesend</Command>
              </Panel>
            </div>

            <div className="mt-6 flex items-center">
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
             * reason a first press fails: an old Node is the whole of what can
             * stop this working, and there is nothing else to arrange. */}
            <p className="mt-6 max-w-[520px] font-sans text-ink-faint text-small">
              It needs Node 22 or newer, and npx securesend works if you would
              rather install nothing. There is nothing to configure and no
              account to make.
            </p>
          </header>

          {/* ---- the mechanism ---------------------------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What sending one looks like
            </h2>

            <div className="mt-8 flex flex-col gap-6 md:mt-12 md:flex-row md:gap-10">
              <Step heading="Your machine does the locking" index="01">
                Pipe a file in, or hand it --text. The command makes a key,
                seals the bytes with AES-256-GCM and sends the result, which is
                the same work a tab does and the same code doing it.
              </Step>
              <Step heading="The link is the only thing on stdout" index="02">
                So it pipes into whatever was going to carry it. The expiry and
                a ready-made burn command go to stderr instead, out of the way
                of anything reading the link.
              </Step>
              <Step heading="Look before you leap" index="03">
                A reveal is one-shot: the server hands the sealed bytes over
                exactly once and destroys its copy in the same transaction. Ask
                status first, which reports the state and consumes nothing.
              </Step>
            </div>

            <div className="mt-8 flex flex-col gap-8 md:mt-12 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1">
                {/* The session, word for word as the commands are spelled, with
                 * `<link>` where a whole link goes because that is how the agent
                 * skill writes them and how they wrap at 390. */}
                <Panel className="px-5 py-4 md:px-6 md:py-5">
                  <div className="flex flex-col gap-3">
                    <Command>cat key.pem | securesend create</Command>
                    <div className="rounded-inner bg-surface-sunken px-3 py-2.5">
                      <LinkSpecimen value={LINK} />
                    </div>
                    <Command>{"securesend status <link>"}</Command>
                    <Command>{"securesend reveal <link>"}</Command>
                  </div>
                </Panel>
              </div>

              <div className="min-w-0 flex-1">
                <p className="max-w-[460px] font-sans text-body text-ink-muted">
                  That is the whole errand. One line seals it, one line asks
                  whether it is still sealed, and one line opens it: text to
                  stdout, files written beside you.
                </p>
                <p className="mt-4 max-w-[460px] font-sans text-body text-ink-muted md:mt-5">
                  A secret lasts 1 hour, 24 hours or 72 hours, and 24 if you say
                  nothing. --password prompts for one rather than taking it as
                  an argument, and headless it is read from SECURESEND_PASSWORD.
                  Send that password by some route other than the one carrying
                  the link.
                </p>
              </div>
            </div>
          </section>

          {/* ---- the verb written for something that is not a person --------
           * `run` and its limits are one section on purpose. It is the reason
           * this CLI exists for agents at all, and it is also the sentence most
           * likely to be read as a bigger promise than it is, so what it does
           * not cover sits directly under it rather than in a footnote. */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              When the thing that needs the secret is a command
            </h2>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1">
                <Panel className="px-5 py-4 md:px-6 md:py-5">
                  <Command>
                    {
                      "securesend run <link> --as DATABASE_URL -- pnpm db:migrate"
                    }
                  </Command>
                </Panel>
              </div>

              <div className="min-w-0 flex-1">
                <p className="max-w-[460px] font-sans text-body text-ink-muted">
                  run opens the secret in memory and hands the plaintext to the
                  child command as an environment variable you name. It never
                  touches stdout, disk or a transcript.
                </p>
                <p className="mt-4 max-w-[460px] font-sans text-body text-ink-muted md:mt-5">
                  If the command exits non-zero the plaintext is still in
                  memory, so the CLI seals it again as a fresh secret with the
                  same password and prints the new link on stderr. A failed run
                  does not destroy the secret.
                </p>
              </div>
            </div>

            {/* The limits, full width, under the thing that causes them. */}
            <Panel className="mt-8 px-5 py-4 md:mt-12 md:px-6 md:py-5">
              <p className="max-w-[720px] font-sans text-body text-ink">
                What run guarantees is{" "}
                <span className="text-accent">narrow</span> and real: the
                plaintext goes into a child process's environment and never into
                your transcript. Nothing beyond that is claimed.
              </p>
              <p className="mt-4 max-w-[720px] font-sans text-body text-ink-muted md:mt-5">
                Once a secret is in a context, keeping it out of logs downstream
                is best effort everywhere. And anyone holding the whole link can
                open the secret, which on a machine that keeps shell history is
                worth remembering before you paste one.
              </p>
            </Panel>

            <div className="mt-8 flex flex-col gap-8 md:mt-12 md:flex-row md:gap-12">
              <div className="min-w-0 flex-1">
                <Panel className="px-5 py-4 md:px-6 md:py-5">
                  <div className="flex flex-col gap-3">
                    <Command>securesend skill</Command>
                    <Command>npx skills add devosurf/securesend</Command>
                  </div>
                </Panel>
              </div>

              <div className="min-w-0 flex-1">
                <p className="max-w-[460px] font-sans text-body text-ink-muted">
                  An agent can read the guide out of the binary it is already
                  holding: securesend skill prints it, and it is the same file
                  the repository publishes, so the two cannot drift. The second
                  line installs it from the repository instead, for an agent
                  that wants it before it has the command.
                </p>
                <p className="mt-4 max-w-[460px] font-sans text-body text-ink-muted md:mt-5">
                  It is written as instructions rather than as marketing: check
                  status before consuming, prefer run over reveal, and treat a
                  secret that reads used when you expected sealed as one
                  somebody else already opened.
                </p>
              </div>
            </div>
          </section>

          {/* ---- what actually leaves the machine ---------------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="max-w-[620px] text-balance font-sans text-heading text-ink-strong">
              What leaves your machine
            </h2>

            <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:gap-16">
              <Facts heading="sends" items={SENDS} tone="sends" />
              <Facts heading="never sends" items={NEVER} tone="never" />
            </div>
          </section>

          {/* ---- your own server, which costs one variable ------------------- */}
          <section className="border-hairline border-t pt-10 pb-12 md:py-16">
            <h2 className="font-sans text-heading text-ink-strong">
              Point it at your own instance
            </h2>

            <div className="mt-8 flex flex-col items-start gap-6 md:mt-10">
              <p className="max-w-[620px] font-sans text-body text-ink-muted">
                SECURESEND_URL points create at whatever server you run, and
                --instance does it for a single command. Opening one needs
                neither: a link carries its own origin, so it goes back to the
                instance that sealed it wherever it is opened. No key, no tier,
                no asking us.
              </p>
              <a
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "gap-2"
                )}
                href={LINKS.selfHosting}
                {...OUTBOUND}
              >
                Self-hosting docs
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
