import { preset, since } from "../lib/timing";
import { Badge } from "../ui/badge";
import { LinkSpecimen } from "../ui/link-specimen";
import { Panel } from "../ui/panel";
import type { Answered } from "./open-secret";
import { DeadEnd } from "./shell";

/*
 * The six ways this page has nothing to give, worded so that a dead link tells the
 * truth and says what to do next.
 *
 * Four of them are dead because the product worked exactly as promised, and they are
 * written that way: calm, never red, no apology for a design doing its job. `expired`
 * is the one screen amber is for, because time is not failure either but it is the one
 * state where somebody usually has to act. `incomplete` is the inversion of the whole
 * set, the only good news here: the link is broken and the secret is fine, which is
 * why its badge is live and teal on a screen whose headline names a failure.
 *
 * Two are new, because a frame cannot fail. `unreachable` is a page that could not
 * ask, and calling that a dead secret would be a guess dressed as a fact.
 * `unreadable` is the press having worked and the key not fitting what came back.
 */

const NAMES = [
  "used",
  "burned",
  "expired",
  "missing",
  "incomplete",
  "unreachable",
  "unreadable",
] as const;

export type DeadEndName = (typeof NAMES)[number];

/**
 * Which dead end a screen is, for a caller whose state is wider than these seven.
 *
 * `unreadable` is the fallback rather than a case of its own, because it is the only
 * honest thing left to say about a screen nothing above matched: the press happened and
 * what came back does not open here.
 */
export function deadEndFor(screen: string): DeadEndName {
  return NAMES.find((name) => name === screen) ?? "unreadable";
}

/*
 * The anatomy lesson, and the one dead end with a composition of its own.
 *
 * Here the instance was asked and had nothing, so either the link was never real or
 * it was spent long ago. The cause is genuinely ambiguous, which is why this is the
 * screen that shows the shape of a whole link with the key picked out. `incomplete`
 * knows its cause before any request and deliberately does not repeat the lesson.
 *
 * The example is plainly an example, at the length a real one runs, and it wears this
 * instance's own host so a self-hosted page teaches its own links rather than ours.
 * Accent is doing its ordinary job, pointing at the live part. Nothing failed.
 */
const EXAMPLE_ID = "3Qk8mR2vT7yLb4NwXc5pAf";
const EXAMPLE_KEY = "AQGf7T2mKq9vRs4WxYz1bCd3EhJk5LnPqUt8VwZa2Bc4De";

function Missing() {
  const host = typeof window === "undefined" ? "" : window.location.host;

  return (
    <div className="mx-auto w-full max-w-[540px] text-center">
      <h1 className="text-balance font-sans text-heading text-ink">
        There's nothing at this link.
      </h1>
      <p className="mt-4 text-pretty font-sans text-body text-ink-muted md:mt-5">
        Either it never existed, or the link lost its tail on the way to you.
      </p>

      {/* At 1440 the specimen is a one-liner and the point is that this is one
       * string. At 390 that one-liner runs off the side, so LinkSpecimen breaks it
       * at the hash: the address on one line and the key on the next, which is also
       * where the anatomy is. */}
      <Panel className="mt-8 px-5 py-4 text-left">
        <div className="rounded-inner bg-surface-sunken px-3 py-2.5 md:bg-transparent md:px-0 md:py-0">
          <LinkSpecimen
            tone="anatomy"
            value={`${host}/s/${EXAMPLE_ID}#${EXAMPLE_KEY}`}
          />
        </div>
        <p className="mt-3 font-sans text-ink-muted text-small">
          The teal part is the key. It never reaches our server, so if it gets
          cut off nobody can recover it, us included.
        </p>
      </Panel>

      <p className="mt-7 text-pretty font-sans text-ink-muted text-small">
        Check the link you were sent still has a hash followed by random
        characters. If it doesn't, ask for it again as plain text rather than
        something a chat app can reformat.
      </p>
    </div>
  );
}

/*
 * Absence.
 *
 * It says used, not opened. Both halves of this screen used to narrate a person
 * reading, and the instance never sees one: it records a press, and whether the
 * browser went on to decrypt anything never leaves that tab. There is also a
 * reachable reader who pressed with the wrong password and then lost the tab, and
 * telling them their secret was opened would be telling them something false.
 *
 * The accusation survives at full volume, which is the binding constraint: a stranger
 * who has been beaten to a secret still reads that it has been used and is still sent
 * back to the sender.
 */
function Used({ answered }: { answered: Answered | null }) {
  const when = answered?.usedAt;

  return (
    <DeadEnd
      badge={<Badge state="gone">Link is spent</Badge>}
      body={`It was used ${when ? since(when) : "already"}. A link works once, so there is nothing left here.`}
      footnote="If that wasn't you, tell whoever sent it. Either way, you'll need a new link."
      heading="This link has already been used."
    />
  );
}

/*
 * The same absence, reached the other way, and the one thing the sender's burn dialog
 * promises out loud: "Anyone who opens the link will be told you burned it."
 *
 * Same composition as `used`, words only. Nothing was read here, so there is nobody
 * to suspect and no accusation to make: the sender did this on purpose, and the only
 * useful thing left to say is to ask them again.
 *
 * The words key on the state rather than on the burn reason the row also carries,
 * because in v0 there is exactly one reason and the reason is this. A second one would
 * be a second variant of this screen, and it would read it then.
 */
function Burned({ answered }: { answered: Answered | null }) {
  const when = answered?.burnedAt;

  return (
    <DeadEnd
      badge={<Badge state="gone">Burned</Badge>}
      body={`They destroyed it ${when ? since(when) : "before anybody opened it"}, and nobody read it. A burned link can't be brought back.`}
      footnote="Ask whoever sent it for a new one."
      heading="The sender burned this link."
    />
  );
}

/*
 * The one screen amber is for.
 *
 * Expired and used are not the same event and must not look the same. Used means the
 * product worked. Expired means a clock ran out on something nobody ever read, which
 * is the state where the sender usually has to act. It is still not an error: amber
 * says time, not failure.
 */
function Expired({ answered }: { answered: Answered | null }) {
  const after = answered
    ? ` after ${preset(answered.createdAt, answered.expiresAt)}`
    : "";

  return (
    <DeadEnd
      badge={<Badge state="expiring">Expired</Badge>}
      body={`It was set to expire${after}, and was never opened.`}
      footnote="Nobody read it, so nothing leaked. Ask whoever sent it for a fresh link."
      heading="This secret expired."
    />
  );
}

/*
 * The only good news in the set, and the inversion it is built on: every other dead
 * end here is dead because the product worked, and this one is the opposite. The link
 * is broken and the secret is fine.
 *
 * The risk in a teal badge on a screen that failed to open something, stated plainly:
 * it could read as "this link is live", which would be a lie. Two things stop it. The
 * badge says "Still sealed", a fact about the secret that cannot be read as a fact
 * about the link. And the headline above it names the failure, so the badge is
 * answering the question the headline raises.
 *
 * This browser can tell before a single request, because the key lives in the
 * fragment and the fragment never leaves the browser. Nothing was fetched, decrypted
 * or consumed to find this out.
 */
function Incomplete() {
  return (
    <DeadEnd
      badge={<Badge state="live">Still sealed</Badge>}
      body="Everything after the # is what decrypts the secret, and it didn't arrive. Some chat apps cut long links short."
      footnote="Nothing has been opened: the secret is still sealed. Ask the sender to send the whole link again."
      heading="This link is missing its key."
    />
  );
}

/*
 * Nothing answered, which is the one state here where the page genuinely does not
 * know. So it says that and nothing more: no badge, because there is no state to
 * name, and no retry control, because reloading the link is the browser's own and
 * costs nothing.
 */
function Unreachable() {
  return (
    <DeadEnd
      body="Nothing has been opened and nothing has been spent. This page just couldn't ask about the link."
      footnote="Check your connection and load the link again."
      heading="We couldn't reach the server."
    />
  );
}

/*
 * The press worked and the key did not fit what came back.
 *
 * A fragment can be damaged in a way the reader cannot see, because the token format
 * carries no checksum, and this is where that shows up. There is no password to try
 * differently, so unlike `retry` there is nothing to do here, which is why it takes
 * the dead end's composition rather than the latch's.
 */
function Unreadable() {
  return (
    <DeadEnd
      badge={<Badge state="gone">Link is spent</Badge>}
      body="The link has done its one job and the copy on the server is gone. What came back doesn't open with the key in this link, so something changed the link on the way to you."
      footnote="Nothing here can recover it, us included. Ask whoever sent it for a new link."
      heading="That didn't open it."
    />
  );
}

export function DeadEndScreen({
  answered,
  name,
}: {
  answered: Answered | null;
  name: DeadEndName;
}) {
  if (name === "used") {
    return <Used answered={answered} />;
  }
  if (name === "burned") {
    return <Burned answered={answered} />;
  }
  if (name === "expired") {
    return <Expired answered={answered} />;
  }
  if (name === "missing") {
    return <Missing />;
  }
  if (name === "incomplete") {
    return <Incomplete />;
  }
  if (name === "unreachable") {
    return <Unreachable />;
  }

  return <Unreadable />;
}
