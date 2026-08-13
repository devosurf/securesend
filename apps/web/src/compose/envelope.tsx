import { type ReactNode, useRef } from "react";
import { useAtDesk } from "../lib/lane";
import { spokenSize } from "../lib/sizes";
import { inAbout } from "../lib/timing";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { ExpiryPicker } from "../ui/expiry-picker";
import { SecretArea, TextInput } from "../ui/field";
import { FieldRow } from "../ui/field-row";
import { FileRow } from "../ui/file-row";
import { Icon } from "../ui/icon";
import { OptionsRow } from "../ui/options-row";
import { Panel } from "../ui/panel";
import { SwapLabel, SwapRow } from "../ui/swap-row";
import { useComposing } from "./composing";
import type { SendProblem } from "./seal-and-send";

/* The two things the one action says, measured together. Locking… is a third
 * narrower than Create link and half the width of Send to #eng-infra, and the
 * action sits at the right-hand end of a strip that lays itself out around it, so
 * a plain swap would shrink the button under the cursor that had just pressed it.
 * See SwapLabel. */
const CREATE = "Create link";
const LOCKING = "Locking…";

/*
 * The envelope the sender fills, which is the product's whole above-fold job.
 *
 * It grows downward from the top of the panel as parts are added, and the seal
 * grows upward from the bottom: a password is not part of what the recipient
 * receives, it is what the envelope is locked with. Every arrival and departure is
 * Collapse, so growing never invents a second grammar.
 *
 * A file arrives the same way, and dragging one over the page arms the panel: the
 * edge takes the focus treatment and the note region takes a tint, so armed says
 * where the file will land as well as that one is coming. The affordance strip
 * becomes the drop prompt in place, through SwapRow, because a prompt inserted
 * mid-drag would move the panel under the cursor at the worst possible moment.
 *
 * One element serves both widths. The note and the settings strip are in the
 * page's build-time markup, so their two sizes are a media query. Every row the
 * envelope grows appears only after the sender has pressed something, so those
 * read the lane at runtime: see useAtDesk in lib/lane.ts.
 *
 * The action is here at a desk and absent on a phone, where the thing that sends
 * the secret is pinned in the bar within thumb reach. The strip keeps only the
 * settings that ride along with it.
 */

/*
 * How many lines of room the note gets.
 *
 * Four is the floor, which with the field's own padding is the 132px the phone
 * composition is measured at, and the desk asks its min-height for a fifth. Past
 * that it grows with the sender's own line breaks, because what people paste in
 * here is usually a list: recovery codes, a private key, a block of config. It does
 * not grow with soft wraps, which would need measuring, and it stops at fourteen,
 * because a field taller than the fold has stopped being a field.
 */
const NOTE_FLOOR_ROWS = 4;
const NOTE_CEILING_ROWS = 14;

function noteRows(note: string): number {
  const lines = note.split("\n").length;

  return Math.min(Math.max(lines, NOTE_FLOOR_ROWS), NOTE_CEILING_ROWS);
}

/*
 * Why nothing happened, in every shape there is to say it.
 *
 * All of them end the same way, and that is the point: the secret is still in this
 * tab, nothing was shared, and doing the thing again is the whole recovery. So
 * there is no retry control, because the control that failed is still on screen and
 * still says what it does. Nothing is red either. This system has no red, and a
 * refused create is not a catastrophe.
 *
 * Half of these are about a file rather than about the send, and they share this
 * one slot because a sender has one place to look for the answer to "why did that
 * do nothing". What differs is the way out, so each names its own.
 */
function refusalOf(
  problem: SendProblem,
  limit: number,
  retryAfter: number
): string {
  if (problem === "too-big") {
    return `That is more than ${spokenSize(limit)} of text, which is the most one envelope holds. Trim it and try again.`;
  }

  /* The two file refusals name the file as the way out, because the sender who
   * hits them is holding one. Telling somebody who attached a disk image to
   * shorten their note would be the accurate cap and the useless instruction. */
  if (problem === "files-too-big") {
    return `That would take this envelope over ${spokenSize(limit)}, which is the most one holds. Nothing was attached. Take something off, or send the big one on its own.`;
  }

  if (problem === "too-many-files") {
    return `One envelope carries ${limit} files. Nothing was attached, so take some off and try again.`;
  }

  if (problem === "unreadable-file") {
    return "That file could not be read, so nothing was attached. If it has moved or been deleted, pick it again from where it is now.";
  }

  if (problem === "unreachable") {
    return "Nothing answered, so nothing was sent. Check your connection and press Create link again.";
  }

  /* The three paces. There is no bot check and no account anywhere in this product, so
   * per-caller limits are how abuse costs are bounded, and an office behind one address
   * will meet one honestly. Each says the wait rather than "in a moment", because
   * whatever refused knows the number and a vague one sends somebody back to be refused.
   *
   * The third is for a refusal that named no cause, which is what a proxy in front of the
   * instance gives. It names none either: claiming the instance was full when it was a
   * network in between would be asserting something this tab cannot know. */
  if (problem === "too-fast") {
    return `That is more links than this instance takes from one place that quickly, so nothing was sent. Nothing has been shared. Try again in ${inAbout(retryAfter)}.`;
  }

  if (problem === "instance-busy") {
    return `This instance is at its limit for now, so nothing was sent. That is not about you, and nothing has been shared. Try again in ${inAbout(retryAfter)}.`;
  }

  if (problem === "limited") {
    return `Something is limiting how often links can be made from here, so nothing was sent. Nothing has been shared. Try again in ${inAbout(retryAfter)}.`;
  }

  return "This instance would not take it, so nothing was sent and nothing was shared.";
}

/* The seal's own row. Not a FieldRow, and deliberately without a label column:
 * there may already be a line in this letter labelled `password`, and it is not the
 * one the recipient types to get in. A lock, a bare field and a placeholder that
 * names whose password it is do the whole job. */
function SealRow() {
  const { fields, onBlur, onFocus, removeSeal, seal, setSealPassword } =
    useComposing();
  const atDesk = useAtDesk();

  const value = seal === null ? "" : seal.value;

  return (
    <div className="flex items-center gap-2.5 border-hairline border-t bg-surface-sunken px-5 py-2.5 md:gap-3 md:py-3">
      <Icon className="text-ink-faint" name="lock" />
      <TextInput
        className="min-w-0 flex-1 font-mono tracking-tight"
        inputSize="md"
        onBlur={onBlur}
        onChange={(event) => setSealPassword(event.target.value)}
        onFocus={onFocus}
        placeholder={
          atDesk
            ? "Set a password they'll need to open it"
            : "Password they'll need"
        }
        ref={fields.seal}
        value={value}
        variant="bare"
      />
      {/* The count keeps its room whether or not there is anything to count, so a
       * field being typed into never changes width under the caret. At 390 there is
       * no room to keep, and the row's own job is the field. */}
      <span
        className={cn(
          "hidden w-[62px] shrink-0 text-right font-mono text-ink-faint text-meta transition-opacity duration-[var(--duration-quick)] motion-reduce:transition-none md:block",
          value === "" ? "opacity-0" : "opacity-100"
        )}
      >
        {value.length} chars
      </span>
      <Button
        aria-label="Remove password"
        className="-mr-1.5 px-2 text-ink-faint"
        onClick={removeSeal}
        size={atDesk ? "sm" : "tap"}
        variant="ghost"
      >
        <Icon name="x" size={13} />
      </Button>
    </div>
  );
}

function Refusal() {
  const { limit, problem, retryAfter } = useComposing();

  /* The sentence outlives the state that made it, so the slot has something to say
   * on the way shut. Reading the live problem instead would swap the sentence for
   * the fallback one for the length of the close. */
  const said = useRef("");
  if (problem) {
    said.current = refusalOf(problem, limit, retryAfter);
  }

  return (
    <Collapse open={problem !== null}>
      <p className="pt-3 font-sans text-ink-muted text-small">{said.current}</p>
    </Collapse>
  );
}

/* The one region a dropped file actually lands in, tinted while a file is over the
 * page, so armed says where as well as whether. */
function DropZone({
  armed,
  children,
}: {
  armed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-colors duration-[var(--duration-quick)] motion-reduce:transition-none",
        armed ? "bg-accent/5" : "bg-transparent"
      )}
    >
      {children}
    </div>
  );
}

/*
 * The strip that offers the parts an envelope can grow, and the drop prompt it
 * becomes mid-drag. Desk only: on a phone there is nothing to drag, and both
 * affordances live in the bar where a thumb can reach them.
 *
 * The credential affordance spends itself when it is used, because there is never
 * a second login. The attach affordance never does, and it keeps a clause that
 * only the empty envelope needs: once a file is in the box, that the box takes
 * files has been demonstrated.
 */
function Affordances() {
  const { addPair, affordances, armed, files, pair, pickFiles } =
    useComposing();

  return (
    <SwapRow
      alternate={
        <div className="flex items-center px-3.5 py-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 font-sans font-semibold text-[11.5px] text-accent">
            <Icon name="paperclip" size={12} />
            Drop the file to attach it
          </span>
        </div>
      }
      /* The divider is always in the box and only changes colour, so the first
       * part added cannot shift the panel by a pixel. */
      className={cn(
        "hidden border-t transition-colors duration-[var(--duration-quick)] motion-reduce:transition-none md:grid",
        pair === null && files.length === 0
          ? "border-transparent"
          : "border-hairline"
      )}
      primary={
        <div className="flex items-center gap-1 px-3.5 py-2">
          <Collapse axis="inline" enter={false} open={pair === null}>
            <Button
              className="gap-1.5"
              onClick={addPair}
              ref={affordances.pairAtDesk}
              size="sm"
              variant="ghost"
            >
              <Icon name="plus" size={12} />
              Add a username and password
            </Button>
          </Collapse>
          <Button
            className="gap-1.5"
            onClick={pickFiles}
            ref={affordances.attachAtDesk}
            size="sm"
            variant="ghost"
          >
            <Icon name="plus" size={12} />
            <span className="flex items-center">
              Attach a file
              <Collapse axis="inline" enter={false} open={files.length === 0}>
                <span className="whitespace-nowrap">, or drop one here</span>
              </Collapse>
            </span>
          </Button>
        </div>
      }
      showAlternate={armed}
    />
  );
}

export function Envelope() {
  const atDesk = useAtDesk();
  const {
    addSeal,
    affordances,
    armed,
    attach,
    canSend,
    expiry,
    fields,
    files,
    focused,
    locking,
    note,
    onBlur,
    onFocus,
    onNoteKey,
    pair,
    removeFile,
    removePair,
    seal,
    send,
    setExpiry,
    setNote,
    setPairPassword,
    setUsername,
    slack,
  } = useComposing();

  const layout = atDesk ? "row" : "stacked";
  const density = atDesk ? "default" : "touch";

  /* The action names where it is going, when the sender told us where that is.
   * The homepage's says Create link, because there they have not. */
  const primary = slack ? `Send to #${slack.channelName}` : CREATE;

  /* A part is unmounted a settle after it is removed, so its slot can close over
   * something. Until then it is still here and shut. */
  const pairOpen = Boolean(pair?.open);
  const sealOpen = Boolean(seal?.open);

  return (
    <div className="w-full max-w-[620px] md:mt-10">
      <Panel armed={armed} className="overflow-hidden" focused={focused}>
        {/* Everything the sender owns dims together while the browser encrypts:
         * they are no longer theirs to edit. */}
        <div
          className={cn(
            "transition-opacity duration-[var(--duration-quick)] motion-reduce:transition-none",
            locking && "pointer-events-none opacity-50"
          )}
        >
          <DropZone armed={armed}>
            {/* The caret is already here when the sender arrives from Slack, and
             * nowhere else. They pressed Enter in a channel a few seconds ago to
             * open this window, so landing anywhere but the field spends the one
             * move the whole integration exists to save. On the homepage the same
             * autofocus would be wrong: a stranger reading it has not begun, and
             * a phone would answer with a keyboard nobody asked for. */}
            <SecretArea
              autoFocus={slack !== undefined}
              className="min-h-[132px] px-5 pt-4 pb-3 md:min-h-[158px] md:pt-5 md:pb-2"
              onBlur={onBlur}
              onChange={(event) => setNote(event.target.value)}
              onFocus={onFocus}
              onKeyDown={onNoteKey}
              placeholder="Paste the secret you need to send"
              rows={noteRows(note)}
              value={note}
            />
          </DropZone>

          {/* Stacked at 390: a 92px label column leaves a mono input about
           * nineteen characters wide, and the sender's one job on these two lines
           * is checking that what they pasted is what they meant. */}
          <Collapse open={pairOpen}>
            <FieldRow
              className="border-hairline border-t"
              density={density}
              inputRef={fields.username}
              label="username"
              layout={layout}
              onBlur={onBlur}
              onChange={setUsername}
              onFocus={onFocus}
              onRemove={removePair}
              placeholder="Paste the username"
              value={pair === null ? "" : pair.username}
            />
            <FieldRow
              className="border-hairline border-t"
              density={density}
              label="password"
              layout={layout}
              onBlur={onBlur}
              onChange={setPairPassword}
              onFocus={onFocus}
              onRemove={removePair}
              placeholder="Paste the password"
              value={pair === null ? "" : pair.password}
            />
          </Collapse>

          {/* Under the parts the sender typed, in the order they attached them,
           * which is the order the envelope numbers them in. */}
          {files.map((file) => (
            <Collapse key={file.id} open={file.open}>
              <FileRow
                className="border-hairline border-t"
                density={density}
                layout={layout}
                meta={spokenSize(file.size)}
                name={file.name}
                onRemove={() => removeFile(file.id)}
              />
            </Collapse>
          ))}

          <Affordances />

          <Collapse open={sealOpen}>
            <SealRow />
          </Collapse>
        </div>

        <OptionsRow
          action={
            <Button
              busy={locking}
              className="hidden md:inline-flex"
              disabled={!canSend}
              onClick={send}
            >
              <SwapLabel
                readings={[primary, LOCKING]}
                said={locking ? LOCKING : primary}
              />
            </Button>
          }
          addPasswordRef={affordances.seal}
          density="responsive"
          expiry={
            <ExpiryPicker
              density="responsive"
              onChange={setExpiry}
              value={expiry}
            />
          }
          onAddPassword={addSeal}
          passwordSet={seal !== null}
          quiet={locking}
        />
      </Panel>

      {/* These go quiet with the panel rather than leaving while it works.
       *
       * They are what the sender owns, so they dim on the same fade the panel's own
       * body does, and they dim rather than collapsing because collapsing is a
       * height: a paragraph closing on the press would take 40 pixels out of the
       * page in the same moment the browser started encrypting, which is the one
       * moment in the product nothing should move. */}
      <div
        className={cn(
          "transition-opacity duration-[var(--duration-quick)] motion-reduce:transition-none",
          locking && "opacity-50"
        )}
      >
        {/* The destination, said before the sender commits rather than after. The
         * second sentence is the reason this window is open at all, so it sits on
         * the same line of thought as the first. */}
        {slack ? (
          <p className="pt-3.5 font-sans text-ink-muted text-small">
            The finished link posts itself back to{" "}
            <span className="text-ink">#{slack.channelName}</span>. Nothing you
            type here goes through Slack.
          </p>
        ) : null}

        {/* Arrives and leaves with the row it explains, so the click reads as one
         * event rather than a row opening and a paragraph appearing. */}
        <Collapse open={sealOpen}>
          <p className="pt-3 font-sans text-ink-muted text-small">
            We never see this password, so we can't check it or reset it. Send
            it
            <span className="hidden md:inline"> to them</span> some other way
            than the link.
          </p>
        </Collapse>

        {/* The one dead end this surface has, and it gets words. A seal row with
         * nothing in it holds the send, because a sender who asked for a password
         * meant it and dropping the option quietly would be worse than waiting. It
         * leaves on the first character typed, so it cannot flicker. */}
        <Collapse open={sealOpen && seal?.value === ""}>
          <p className="pt-2 font-sans text-ink-faint text-small">
            Create link waits until you type it, or take the line off again.
          </p>
        </Collapse>
      </div>

      <Refusal />

      {/* This device's own picker, which on a phone is where photos live too. It is
       * hidden rather than absent because the control that opens it is in two
       * places: the strip at a desk, the bar on a phone. Clearing the value is what
       * lets the same file be picked twice running and still fire a change. */}
      <input
        className="hidden"
        multiple
        onChange={async (event) => {
          const chosen = Array.from(event.target.files ?? []);
          event.target.value = "";
          await attach(chosen);
        }}
        ref={fields.picker}
        type="file"
      />
    </div>
  );
}
