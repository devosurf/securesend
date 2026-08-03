import { useRef } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { ExpiryPicker } from "../ui/expiry-picker";
import { SecretArea, TextInput } from "../ui/field";
import { FieldRow } from "../ui/field-row";
import { Icon } from "../ui/icon";
import { OptionsRow } from "../ui/options-row";
import { Panel } from "../ui/panel";
import { spokenSize, useComposing } from "./composing";
import type { SendProblem } from "./seal-and-send";

/*
 * The envelope the sender fills, which is the product's whole above-fold job.
 *
 * It grows downward from the top of the panel as parts are added, and the seal
 * grows upward from the bottom: a password is not part of what the recipient
 * receives, it is what the envelope is locked with. Every arrival and departure is
 * Collapse, so growing never invents a second grammar.
 *
 * One element serves both widths. The note and the settings strip are in the
 * page's build-time markup, so their two sizes are a media query. Every row the
 * envelope grows appears only after the sender has pressed something, so those
 * take the lane as a prop: see useAtDesk in composing.tsx.
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
 * Why nothing was sent, in the three shapes there are to say it.
 *
 * All of them end the same way, and that is the point: the secret is still in this
 * tab, nothing was shared, and pressing the button again is the whole recovery. So
 * there is no retry control, because the control that failed is still on screen and
 * still says Create link. Nothing is red either. This system has no red, and a
 * refused create is not a catastrophe.
 */
function refusalOf(problem: SendProblem, limit: number): string {
  if (problem === "too-big") {
    return `That is more than ${spokenSize(limit)} of text, which is the most one envelope holds. Trim it and try again.`;
  }

  if (problem === "unreachable") {
    return "Nothing answered, so nothing was sent. Check your connection and press Create link again.";
  }

  return "This instance would not take it, so nothing was sent and nothing was shared.";
}

/* The seal's own row. Not a FieldRow, and deliberately without a label column:
 * there may already be a line in this letter labelled `password`, and it is not the
 * one the recipient types to get in. A lock, a bare field and a placeholder that
 * names whose password it is do the whole job. */
function SealRow() {
  const { atDesk, fields, onBlur, onFocus, removeSeal, seal, setSealPassword } =
    useComposing();

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
  const { limit, problem } = useComposing();

  /* The sentence outlives the state that made it, so the slot has something to say
   * on the way shut. Reading the live problem instead would swap the sentence for
   * the fallback one for the length of the close. */
  const said = useRef("");
  if (problem) {
    said.current = refusalOf(problem, limit);
  }

  return (
    <Collapse open={problem !== null}>
      <p className="pt-3 font-sans text-ink-muted text-small">{said.current}</p>
    </Collapse>
  );
}

export function Envelope() {
  const {
    addPair,
    addSeal,
    affordances,
    atDesk,
    canSend,
    expiry,
    fields,
    focused,
    locking,
    note,
    onBlur,
    onFocus,
    pair,
    removePair,
    seal,
    send,
    setExpiry,
    setNote,
    setPairPassword,
    setUsername,
  } = useComposing();

  const layout = atDesk ? "row" : "stacked";
  const density = atDesk ? "default" : "touch";

  /* A part is unmounted a settle after it is removed, so its slot can close over
   * something. Until then it is still here and shut. */
  const pairOpen = Boolean(pair?.open);
  const sealOpen = Boolean(seal?.open);

  return (
    <div className="w-full max-w-[620px] md:mt-10">
      <Panel className="overflow-hidden" focused={focused}>
        {/* Everything the sender owns dims together while the browser encrypts:
         * they are no longer theirs to edit. */}
        <div
          className={cn(
            "transition-opacity duration-[var(--duration-quick)] motion-reduce:transition-none",
            locking && "pointer-events-none opacity-50"
          )}
        >
          <SecretArea
            className="min-h-[132px] px-5 pt-4 pb-3 md:min-h-[158px] md:pt-5 md:pb-2"
            onBlur={onBlur}
            onChange={(event) => setNote(event.target.value)}
            onFocus={onFocus}
            placeholder="Paste the secret you need to send"
            rows={noteRows(note)}
            value={note}
          />

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

          {/* The affordance spends itself when it is used: you cannot add a second
           * login. On a phone it lives in the bar instead, so the whole strip is
           * absent there rather than empty. */}
          <Collapse enter={false} open={pair === null}>
            <div className="hidden items-center px-3.5 py-2 md:flex">
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
            </div>
          </Collapse>

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
              {locking ? "Locking…" : "Create link"}
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

      {/* Arrives and leaves with the row it explains, so the click reads as one
       * event rather than a row opening and a paragraph appearing. */}
      <Collapse open={sealOpen && !locking}>
        <p className="pt-3 font-sans text-ink-muted text-small">
          We never see this password, so we can't check it or reset it. Send it
          <span className="hidden md:inline"> to them</span> some other way than
          the link.
        </p>
      </Collapse>

      {/* The one dead end this surface has, and it gets words. A seal row with
       * nothing in it holds the send, because a sender who asked for a password
       * meant it and dropping the option quietly would be worse than waiting. It
       * leaves on the first character typed, so it cannot flicker. */}
      <Collapse open={sealOpen && seal?.value === "" && !locking}>
        <p className="pt-2 font-sans text-ink-faint text-small">
          Create link waits until you type it, or take the line off again.
        </p>
      </Collapse>

      <Refusal />
    </div>
  );
}
