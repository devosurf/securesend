import type { OpenedEnvelope } from "@securesend/crypto/envelope";
import { useAtDesk } from "../lib/lane";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CopyRow } from "../ui/copy-row";
import { Panel } from "../ui/panel";
import { TakeButton } from "../ui/take-button";
import { partsOf } from "./parts";
import { DeadEnd } from "./shell";

/*
 * The secret, open, and the two seconds the recipient has to get it somewhere they own.
 *
 * Every part gets its own row and its own copy button, which is the whole reason the
 * envelope has parts: a wall of text makes somebody select a password out of a
 * paragraph by hand, and a row makes it one press. The password is masked until asked
 * for, because the recipient is often on a shared screen, and it is verbatim, because
 * it may be read off the screen and typed by hand: it never truncates, it wraps by
 * character, and it carries its character count so the reader can check they got all of
 * it.
 *
 * Take everything exists because recipients close the tab, or the screen locks, or the
 * chat app's browser gets swiped away, and the secret goes with it. That is a phone
 * failure far more than a desk one, so on a phone the control is the page's floor
 * rather than the end of its scroll: a thumb rests in the bottom third, and an action
 * stranded past four rows of content is an action half of them never reach. It is a
 * flex sibling of the scroll region and never an overlay, so the last row can never end
 * up underneath it. At a desk it is the panel's last row instead, where it acts on the
 * rows above and reads as their sum.
 *
 * The whole idea stands or falls on the confirmation, which is why the bar says where
 * what it took went, in plain words, afterwards. Silence would be the version of this
 * idea that fails.
 */

async function toClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** What the bar is about to take, or took, named in parts so nothing is a surprise. */
function named(secret: OpenedEnvelope): { taken: string; takes: string } {
  if (secret.note !== undefined && secret.credentials) {
    return { taken: "Note and login copied", takes: "the note and the login" };
  }

  return secret.credentials
    ? { taken: "Login copied", takes: "the login" }
    : { taken: "Note copied", takes: "the note" };
}

export function TakeBar({
  onTake,
  secret,
  taken,
}: {
  onTake: () => Promise<void>;
  secret: OpenedEnvelope;
  taken: boolean;
}) {
  const atDesk = useAtDesk();
  const words = named(secret);

  return (
    <>
      <p className="font-sans text-ink-muted text-small">
        {taken
          ? `${words.taken} to your clipboard.`
          : `One press puts ${words.takes} on your clipboard.`}
      </p>
      <TakeButton
        className="w-full md:w-auto"
        done={taken}
        doneLabel="Taken"
        icon="copy"
        label="Take everything"
        onTake={onTake}
        size={atDesk ? "md" : "touch"}
      />
    </>
  );
}

export function Opened({
  onSaved,
  onTake,
  secret,
  taken,
}: {
  onSaved: () => void;
  onTake: () => Promise<void>;
  secret: OpenedEnvelope;
  taken: boolean;
}) {
  const atDesk = useAtDesk();
  const parts = partsOf(secret);

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <div className="flex items-center justify-between gap-3 md:block">
        <h1 className="font-sans text-heading text-ink-strong">Here it is.</h1>
        <Badge className="shrink-0 md:hidden" state="gone">
          Link is dead
        </Badge>
      </div>
      <p className="mt-3 max-w-[480px] font-sans text-body text-ink-muted md:mt-4">
        Take what you need now. This link stopped working the moment you opened
        it.
      </p>

      <Panel className="mt-6 overflow-hidden md:mt-8">
        {parts.map((part, index) => (
          <CopyRow
            className={cn(index > 0 && "border-hairline border-t")}
            density={atDesk ? "default" : "touch"}
            key={part.label}
            label={part.label}
            layout={atDesk ? "row" : "stacked"}
            masked={part.masked ?? false}
            /* The row shows its tick once this settles, so a browser that refused
             * the write leaves it unsettled rather than saying Copied over a
             * clipboard that does not have it. */
            onCopy={toClipboard}
            tone={part.tone ?? "mono"}
            value={part.value}
            /* The desk row has room for a password on one line, so it reads as one.
             * The phone's does not, and a wrapped password has to say where it ends
             * and carry its own character count: see verbatim in CopyRow. */
            verbatim={!atDesk && (part.verbatim ?? false)}
          />
        ))}

        {parts.length > 1 ? (
          <div className="hidden items-center justify-between gap-4 border-hairline border-t bg-surface-sunken px-5 py-4 md:flex">
            <TakeBar onTake={onTake} secret={secret} taken={taken} />
          </div>
        ) : null}
      </Panel>

      <p className="mt-4 font-sans text-ink-muted text-small md:mt-3">
        What you take lands on your {atDesk ? "machine" : "phone"} in plain text
        and stays there until you delete it.
      </p>

      <div className="mt-5 md:mt-7 md:flex md:items-center md:justify-between md:gap-6">
        <div className="hidden items-center gap-3 md:flex">
          <Badge state="gone">Link is dead</Badge>
          <span className="font-sans text-ink-muted text-small">
            Nothing is left on the server.
          </span>
        </div>
        <Button
          className="w-full md:w-auto"
          onClick={onSaved}
          size={atDesk ? "md" : "touch"}
          variant="secondary"
        >
          I've saved it
        </Button>
      </div>
    </div>
  );
}

/*
 * Absence, but not loss.
 *
 * `used` is written for a stranger arriving at a dead link. This is the same finality
 * reached from the other side, one step after the recipient took the contents out, and
 * two lines of that screen stop being true here: "there is nothing left" is the bleak
 * reading of a page that is only bleak if you left empty handed.
 *
 * It is also the one screen in this family that keeps the word "Opened", and it is
 * right to: this browser watched the decryption happen. The word is banned where the
 * instance is the only witness, not where the browser is.
 *
 * The phone carries one line the desk does not, because what happens next differs: the
 * recipient is one swipe from being back in Slack, and half of what they took is on a
 * clipboard the next copy overwrites.
 */
export function Saved() {
  const atDesk = useAtDesk();

  return (
    <div className="mx-auto w-full max-w-[500px]">
      <DeadEnd
        badge={<Badge state="gone">Opened</Badge>}
        body="You opened it a moment ago, and that deleted it. Nothing is left here. The copy you took is yours to look after."
        footnote="If you missed a part of it, ask whoever sent it for a new link."
        heading={`It's on your ${atDesk ? "machine" : "phone"} now.`}
      />

      <p className="mt-3 text-balance text-center font-sans text-ink-faint text-small md:hidden">
        Paste the login somewhere safe before you copy something else.
      </p>
    </div>
  );
}
