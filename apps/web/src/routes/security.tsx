import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { buttonVariants } from "../ui/button";
import { Icon } from "../ui/icon";
import { LinkSpecimen } from "../ui/link-specimen";
import { Panel } from "../ui/panel";
import { TextLink } from "../ui/text-link";
import { Wordmark } from "../ui/wordmark";

/*
 * securesend.dev/security is the whole security story, written out.
 *
 * ==== the eight parts ======================================================
 *
 * 1 the model, in one paragraph      5 the page you're trusting
 * 2 what our server sees             6 abuse, honestly
 * 3 one-time, precisely              7 what we can't protect you from
 * 4 password protection, precisely   8 for the skeptical
 *
 * ==== the register =========================================================
 *
 * The claims rule is the whole writing brief and it is stricter here than
 * anywhere else, because this is the page a security team reads before they let
 * anyone use the thing.
 *
 * Mechanism leads and the label follows. "End-to-end encrypted" and
 * "zero-knowledge" both appear, and both sit inside sight of the caveat: the link
 * is the secret. Section 1 puts that caveat at full width immediately under the
 * paragraph rather than in a footnote, which is the reason section 1 is shaped the
 * way it is.
 *
 * Banned outright, and absent: military-grade, unhackable, 100% secure, "audited"
 * with no named audit, any compliance acronym, any framing that implies we cannot
 * be breached. The honest version of that last one is in section 2 and it is a
 * selling point: breaching our server yields ciphertext.
 *
 * A tombstone reads `used`, never `opened`: the server learns that somebody
 * pressed Reveal and that the ciphertext went out, never that anyone read it. This
 * page is the last place in the product that would be allowed to overclaim, so
 * section 3 keeps the distinction that matters, which is that a spent link is
 * distinguishable from one the sender burned.
 *
 * ==== the two widths ======================================================
 *
 * Every word holds at 390. Nothing is cut for the phone: a security page that says
 * less on the device most people will read it on would be choosing the wrong thing
 * to economise. Two things here are furniture rather than prose and neither
 * survives 390, so both move:
 *
 *   the numeral gutter   an 8px column plus a 40px gap, spent on a section number,
 *                        eats an eighth of the screen and pushes the measure under
 *                        300. The number goes inline above the heading, where it
 *                        costs a line and no width.
 *   the sees/never table two columns side by side at 390 give each about 160px,
 *                        which breaks four-word phrases onto three lines. They
 *                        stack, and stacking makes the contrast weaker, so the two
 *                        headings carry more of the work than they do on the desk.
 */

export const Route = createFileRoute("/security")({
  component: Security,
});

const LINK = "securesend.dev/s/7hK2mQ#k3xRv9LpQe2mAw";

function Section({
  index,
  heading,
  children,
}: {
  index: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="border-hairline border-t pt-8 pb-10 md:pt-10 md:pb-14">
      <div className="md:flex md:gap-10">
        <span className="font-mono text-ink-faint text-meta md:w-8 md:shrink-0 md:pt-1.5">
          {index}
        </span>
        <div className="md:min-w-0 md:flex-1">
          <h2 className="mt-2 max-w-[620px] text-balance font-sans text-heading text-ink-strong md:mt-0">
            {heading}
          </h2>
          <div className="mt-5 flex max-w-[680px] flex-col gap-4 md:mt-6 md:gap-5">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <p className="font-sans text-body text-ink-muted">{children}</p>;
}

/* A term the page is defining rather than using. Ink, not accent: accent means
 * live in this system and a definition is not a state. */
function Term({ children }: { children: ReactNode }) {
  return <span className="text-ink">{children}</span>;
}

function Facts({
  heading,
  tone,
  items,
}: {
  heading: string;
  tone: "stores" | "never";
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
                tone === "stores" ? "text-ink-faint" : "text-accent"
              )}
              name={tone === "stores" ? "lock" : "eye-off"}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STORES = [
  "The ciphertext, until the reveal or the expiry, whichever comes first.",
  "Created, expires and used timestamps.",
  "A status, and the size of the payload.",
] as const;

const NEVER = [
  "The plaintext, the key, or your password.",
  "Filenames. They are encrypted inside the envelope.",
  "Whether a password protects it. That flag rides the fragment.",
  "Which IP opened what. It is not logged.",
] as const;

function Security() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-[420px] [background:var(--wash-accent)] md:h-[560px]"
      />

      <nav className="relative flex items-center justify-between px-5 pt-7 md:px-16 md:pt-10">
        <RouteLink to="/" tone="quiet" viewTransition>
          <Wordmark />
        </RouteLink>
        <div className="flex items-center gap-8">
          <RouteLink className="text-small" to="/" tone="quiet" viewTransition>
            Send a secret
          </RouteLink>
          {/* The homepage answers this in its own footer, so there it is an
           * in-page anchor. This page has no such section, and an anchor to an id
           * it does not have would scroll nowhere. The self-hosting story is
           * repository markdown either way. */}
          <TextLink
            className="hidden text-small md:inline"
            href={LINKS.selfHosting}
            tone="quiet"
            {...OUTBOUND}
          >
            Self-host
          </TextLink>
        </div>
      </nav>

      <main className="relative px-5 md:px-16">
        <div className="mx-auto max-w-[1000px]">
          <header className="pt-12 pb-10 md:pt-[72px] md:pb-16">
            <h1 className="max-w-[760px] text-balance font-display text-display-sm text-ink-strong md:text-display">
              How this <span className="text-accent">actually</span> works.
            </h1>
            <p className="mt-5 max-w-[540px] font-sans text-body text-ink-muted md:mt-7">
              The mechanism, the limits, and the things we are not claiming.
              Written to be checked against the source rather than believed.
            </p>
          </header>

          <Section heading="The model, in one paragraph" index="01">
            <Body>
              Your secret is encrypted in your browser before anything leaves
              it, with <Term>AES-256-GCM</Term> through the browser's own Web
              Crypto. The key is generated in your browser and travels only in
              the URL fragment, the part after the{" "}
              <span className="text-accent">#</span>, which browsers never send
              to any server. We store ciphertext. The link works exactly once.
            </Body>

            {/* The caveat is full width and directly under the paragraph, not a
             * footnote. A label like end-to-end is only honest within sight of
             * this sentence. */}
            <Panel className="px-5 py-4 md:px-6 md:py-5">
              <p className="font-sans text-body text-ink">
                Anyone holding the full link can decrypt it. The link{" "}
                <span className="text-accent">is</span> the secret. Treat it
                like one.
              </p>
              {/* At 390 the specimen gets a ground of its own, because a value
               * that wraps needs a container to say the wrap is a wrap. */}
              <div className="mt-4 rounded-inner bg-surface-sunken px-3 py-2.5 md:bg-transparent md:px-0 md:py-0">
                <LinkSpecimen tone="anatomy" value={LINK} />
              </div>
            </Panel>

            <Body>
              That is what <Term>end-to-end encrypted</Term> means here, and it
              is the sense in which the service is <Term>zero-knowledge</Term>:
              not that a link is unguessable magic, but that the key exists only
              in two browsers and never in our database.
            </Body>
          </Section>

          <Section heading="What our server sees, and never sees" index="02">
            <div className="flex flex-col gap-4 md:flex-row md:gap-14">
              <Facts heading="stores" items={STORES} tone="stores" />
              <Facts heading="never" items={NEVER} tone="never" />
            </div>

            <Body>
              Anything keyed to an IP address, such as rate-limit counters and
              proxy access logs, expires within 24 hours, and the application
              never writes a secret's id and an IP address to the same place. So
              we can say this and mean it:{" "}
              <Term>
                we cannot tell you which IP opened your secret, because we do
                not record it
              </Term>
              .
            </Body>

            <Body>
              When an envelope dies, the ciphertext is destroyed and what
              remains is a tombstone: a status and its timestamps, nothing else.
              Seven days past expiry the whole row is hard-deleted, after which
              a missing secret is indistinguishable from one that never existed.
              That is a privacy property, not an oversight.
            </Body>

            <Body>
              Our own instance sits behind Cloudflare, which sees IP addresses,
              paths, and ciphertext in transit. It never sees a fragment,
              because no browser sends one, and it never sees plaintext.
            </Body>

            {/* The honest version of a claim we are not allowed to make. */}
            <Body>
              We are not going to tell you we cannot be breached. The useful
              thing is what a breach would yield:{" "}
              <Term>encrypted bytes and some timestamps</Term>.
            </Body>
          </Section>

          <Section heading="One-time, precisely" index="03">
            <Body>
              Loading the page never consumes the secret. Only the explicit
              reveal press does, and that press is atomic: two racing clicks
              have exactly one winner, ever. Link-preview bots cannot burn what
              a page load does not touch.
            </Body>

            <Body>
              Dead links tell the truth, and the distinction matters:{" "}
              <Term>used</Term> is not the same as{" "}
              <Term>burned by the sender</Term> is not the same as{" "}
              <Term>expired</Term>. We say the link was used rather than that it
              was read, because the server learns that somebody pressed Reveal
              and that the ciphertext went out, never that anybody could
              actually decrypt it. If you never pressed it and it says used,
              that is your signal to rotate the credential.
            </Body>

            <Body>
              A sender can burn a secret early without an account. The browser
              that created it holds a device-local management token, which is
              unrelated to the encryption key and cannot decrypt anything.
            </Body>
          </Section>

          <Section heading="Password protection, precisely" index="04">
            <Body>
              The password <Term>composes</Term> with the link key, it never
              replaces it. The final decryption key is derived from both, so the
              link alone is useless, the password alone is useless, and our
              database alone is useless.
            </Body>

            <Body>
              Derivation is <Term>PBKDF2-HMAC-SHA256</Term>, 600,000 iterations,
              a 128-bit random salt, native Web Crypto. There is no verifier on
              our side: we cannot tell a right password from a wrong one, which
              is why a wrong attempt still spends the link and the retries then
              happen in your browser's memory.
            </Body>

            <Body>
              Argon2id would be the better algorithm. It is memory-hard, and
              roughly a hundred times fewer guesses per second on a GPU.
              Browsers do not ship it, so using it would mean serving a
              third-party WASM blob on exactly the page whose pitch is that
              there is no third-party code on it. We took the weaker KDF and the
              stronger page. The fragment format carries a version byte so this
              can change, and links expire within 72 hours, which makes crypto
              migrations unusually painless.
            </Body>

            <Body>
              The password matters most when the channel carrying the link is
              the untrustworthy part. In that case interception is also{" "}
              <Term>detectable</Term>: the person who should have received it
              arrives to find the envelope already gone.
            </Body>
          </Section>

          <Section heading="The page you're trusting" index="05">
            <Body>
              Zero third-party scripts and zero analytics, site-wide. No
              CAPTCHA, because a CAPTCHA is third-party JavaScript in the page
              context where the key is born, which is the one place it cannot
              go. View source and count.
            </Body>

            <Body>
              A strict content security policy,{" "}
              <Term>frame-ancestors 'none'</Term> so nobody can iframe a burn
              button, <Term>no-referrer</Term>, <Term>noindex</Term> on secret
              routes, <Term>no-store</Term> on anything carrying ciphertext, and
              no service worker.
            </Body>

            <Body>
              The key is scrubbed out of the address bar the moment the page has
              captured it, so browser history and profile sync never hold it.
              Your copy of the link is the one in the message you were sent.
            </Body>
          </Section>

          <Section heading="Abuse, honestly" index="06">
            <Body>
              We cannot scan what we cannot read, and we would rather keep it
              that way. So abuse control is structural: one-time links,
              lifetimes of at most 72 hours, per-IP rate limits on making,
              opening and looking up a secret, and a global creation limit. It
              makes a poor hosting medium.
            </Body>

            <Body>
              <Term>abuse@securesend.dev</Term> is read by a human and we can
              kill a reported link. Reporting one grants nobody anything they
              did not already have, because anyone holding a link can already
              destroy it by opening it. <Term>security@securesend.dev</Term> is
              for vulnerability disclosure.
            </Body>

            <Body>
              The trade we are making, stated plainly: minimal logging means
              weak forensics. If something bad happens through this service, we
              will have very little to hand anybody. Recipient privacy wins that
              argument, and we would rather say so than pretend the tension is
              not there.
            </Body>
          </Section>

          <Section heading="What we can't protect you from" index="07">
            <Body>
              <Term>Your device.</Term> Malware, clipboard history, browser
              extensions and synced tabs are all outside the envelope. A secret
              you take out of it is a plain text file on a real computer.
            </Body>

            <Body>
              <Term>Your channel.</Term> The message carrying the link keeps
              that link forever, in a Slack history, in a mailbox, in a backup.
              That is exactly what the password option is for.
            </Body>

            <Body>
              <Term>The recipient.</Term> One-time means one delivery. It does
              not mean a person cannot screenshot, paste, or remember what they
              were shown.
            </Body>

            <Body>
              <Term>And the asterisk on all browser cryptography:</Term> you are
              trusting the code we serve you at the moment you use it. We cannot
              prove a negative about that. What we can do is keep the code open,
              keep the crypto in one small file worth reading, and make
              self-hosting a first-class path, so that not trusting us stays a
              practical option rather than a rhetorical one.
            </Body>
          </Section>

          <Section heading="For the skeptical" index="08">
            <Body>
              The cryptography is one small dependency-free package. It is
              genuinely readable in a sitting, and it is the only part you have
              to trust to believe everything above.
            </Body>

            {/* Every one of these leaves for the repository, which is the point of
             * the section: the page stops asserting and hands over the thing you
             * would check it against. At 390 they stack, because four tap targets
             * in a line are four near-misses, and the first one drops its button
             * for the same reason the others are links. */}
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-4">
              <a
                className={cn(
                  buttonVariants({ size: "sm", variant: "secondary" }),
                  "hidden gap-2 md:inline-flex"
                )}
                href={LINKS.crypto}
                {...OUTBOUND}
              >
                Read the crypto
                <Icon name="arrow-right" size={13} />
              </a>
              <TextLink
                className="inline-flex items-center gap-2 text-small md:hidden"
                href={LINKS.crypto}
                {...OUTBOUND}
              >
                Read the crypto
                <Icon name="arrow-right" size={13} />
              </TextLink>
              <TextLink
                className="text-small"
                href={LINKS.source}
                tone="quiet"
                {...OUTBOUND}
              >
                Whole repository
              </TextLink>
              <TextLink
                className="text-small"
                href={LINKS.selfHosting}
                tone="quiet"
                {...OUTBOUND}
              >
                Run your own
              </TextLink>
              <TextLink
                className="text-small"
                href={LINKS.security}
                tone="quiet"
              >
                security@securesend.dev
              </TextLink>
            </div>

            {/* The absence of badges, said out loud, because a security page with
             * no badges reads as an oversight unless it is deliberate. */}
            <Body>
              There are no compliance badges on this page. We have not had an
              external audit, we are not SOC 2 certified, and we are not making
              a HIPAA claim. When any of that becomes true it will appear here
              with the name of who did it and a date.
            </Body>
          </Section>

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
              {/* Sans, not mono: this is a sentence about the product, and mono is
               * reserved for machine-shaped text. It is also the one claim on this
               * page a reader can check in one click, so it is a link rather than a
               * footnote. */}
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
