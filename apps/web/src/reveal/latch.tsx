import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { useAtDesk } from "../lib/lane";
import { until } from "../lib/timing";
import { cn } from "../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapse } from "../ui/collapse";
import { Icon } from "../ui/icon";
import { Panel } from "../ui/panel";
import { PasswordRow } from "../ui/password-row";
import type { Revealing } from "./revealing";

/*
 * The latch, and the retry it can turn into.
 *
 * Everything on this screen is paying for one click, so the cost is legible before the
 * click rather than under it as fine print. Nothing is deferred to a confirmation
 * either: a second surface asking "are you sure" would be a worse version of saying it
 * plainly the first time.
 *
 * With a password the field is a row inside the sealed panel and not a gate screen in
 * front of it. The password is a property of the thing on the screen, not a door before
 * it, and putting it in the panel says exactly that. It carries no label, because the
 * envelope may well contain a credential called "password" and the word would be
 * ambiguous the moment the secret opened. Masked, unlike the sender's own field, because
 * the recipient is often on a shared screen and this is somebody else's password.
 *
 * "Open it once" is disabled while the field is empty, and that is the only check
 * anywhere in SecureSend. There is no verifier: the password never reaches the instance,
 * so the button is not asking whether this is correct, only whether there is something
 * here to try. Enter does not submit. The one irreversible act in the product is a
 * press, deliberately.
 *
 * Retry is the same bones, because nothing structural changed: the secret is still
 * encrypted, the same field takes the same password, the same button does the same
 * thing. The bars do not move either, since nothing was decrypted, and a preview that
 * changed would claim progress that did not happen. What had to change is the header
 * line, which said "Still sealed. Nobody has read it, including us." and was false the
 * moment the press landed.
 *
 * At a desk this is one centred column. On a phone it splits: everything that explains
 * centres itself in whatever room is left, and the act, meaning the consequence, the
 * button and the number under it, is a block in the bottom third where a thumb rests.
 * The block is held by the layout and never pinned over it, so nothing can end up
 * sitting on top of the panel's own Show button.
 */

/* Texture and nothing else. The instance genuinely does not know whether this is a
 * password, a note or a file, so a preview implying structure would be a lie told by the
 * one screen whose whole job is to be believed.
 *
 * A phone gets more lines and a shorter tail, because a narrower column wraps the same
 * unknown payload further, and fewer of them when a field wants the room. */
interface Bar {
  id: string;
  width: string;
}

const AT_DESK: Bar[] = [
  { id: "first", width: "w-full" },
  { id: "second", width: "w-full" },
  { id: "tail", width: "w-[54%]" },
];

const ON_PHONE: Bar[] = [
  { id: "first", width: "w-full" },
  { id: "second", width: "w-full" },
  { id: "third", width: "w-full" },
  { id: "fourth", width: "w-full" },
  { id: "tail", width: "w-[38%]" },
];

const ON_PHONE_TIGHT: Bar[] = [
  { id: "first", width: "w-full" },
  { id: "tail", width: "w-[46%]" },
];

const CONSEQUENCE = "font-sans text-ink-muted text-small";

function Row({ bars, className }: { bars: Bar[]; className: string }) {
  return (
    <div className={cn("flex-col gap-3 px-5 py-3 md:py-6", className)}>
      {bars.map((bar) => (
        <div
          className={cn("h-3 rounded-inner bg-surface-raised", bar.width)}
          key={bar.id}
        />
      ))}
    </div>
  );
}

function Bars({ tight }: { tight: boolean }) {
  return (
    <>
      <Row bars={AT_DESK} className="hidden md:flex" />
      <Row
        bars={tight ? ON_PHONE_TIGHT : ON_PHONE}
        className="flex md:hidden"
      />
    </>
  );
}

/** Prose the desk has room for, and the phone's shorter way of saying it. */
function AtDesk({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline">{children}</span>;
}

function OnPhone({ children }: { children: ReactNode }) {
  return <span className="md:hidden">{children}</span>;
}

/** A phone with a field to type in gives the panel less room above it. */
function panelGap(spent: boolean, needsPassword: boolean): string {
  if (spent) {
    return "mt-5";
  }

  return needsPassword ? "mt-4" : "mt-7";
}

function Header({
  needsPassword,
  spent,
}: {
  needsPassword: boolean;
  spent: boolean;
}) {
  if (spent) {
    return (
      <>
        Held in this tab.
        <AtDesk> Nothing on the server anymore.</AtDesk>
      </>
    );
  }

  return (
    <>
      {needsPassword ? (
        <>
          <AtDesk>Still sealed.</AtDesk>
          <OnPhone>Sealed.</OnPhone>
        </>
      ) : (
        "Still sealed."
      )}{" "}
      Nobody has read it, including us.
    </>
  );
}

function Explain({
  field,
  needsPassword,
  password,
  setPassword,
  spent,
}: {
  field: RefObject<HTMLInputElement | null>;
  needsPassword: boolean;
  password: string;
  setPassword: (value: string) => void;
  spent: boolean;
}) {
  const atDesk = useAtDesk();

  return (
    <div className="flex w-full flex-1 flex-col justify-center md:flex-none">
      <div className="w-full text-center">
        <h1 className="text-balance font-sans text-heading text-ink-strong">
          {spent ? "That password didn't work." : "Someone sent you a secret."}
        </h1>

        {spent ? (
          <p className="mt-4 hidden font-sans text-body text-ink-muted md:block">
            The link has done its one job: the copy on the server is gone. The
            encrypted secret is still here in this tab, so you can try again.
          </p>
        ) : (
          <p className="mt-3 font-sans text-body text-ink-muted md:mt-4">
            {needsPassword ? (
              <>
                <AtDesk>
                  It's locked with a password, and it can only be opened once.
                </AtDesk>
                <OnPhone>Locked with a password. It opens once.</OnPhone>
              </>
            ) : (
              "This can only be opened once."
            )}
          </p>
        )}
      </div>

      <Panel
        className={cn(
          "w-full overflow-hidden md:mt-9",
          panelGap(spent, needsPassword)
        )}
      >
        <div className="flex items-center justify-between gap-3 border-hairline border-b px-5 py-2.5 md:gap-4 md:py-3">
          <span className="flex items-center gap-2.5">
            <Icon className="text-ink-faint" name="lock" />
            <span className="font-sans text-ink-faint text-small">
              <Header needsPassword={needsPassword} spent={spent} />
            </span>
          </span>
          {spent ? <Badge state="gone">Link is spent</Badge> : null}
        </div>

        <Bars tight={needsPassword} />

        {needsPassword ? (
          <PasswordRow
            density={atDesk ? "default" : "touch"}
            inputRef={field}
            onChange={setPassword}
            placeholder="The password the sender gave you"
            value={password}
          />
        ) : null}
      </Panel>
    </div>
  );
}

function Cost({
  needsPassword,
  spent,
}: {
  needsPassword: boolean;
  spent: boolean;
}) {
  if (spent) {
    return (
      <p className={CONSEQUENCE}>
        <AtDesk>If you close this tab it's gone for good.</AtDesk>
        <OnPhone>
          The only copy is in this tab. A phone can let go of a tab you have
          been away from, so if you go looking for the password, come back soon.
        </OnPhone>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className={CONSEQUENCE}>
        {needsPassword ? (
          <>
            <AtDesk>
              Opening it decrypts it here in your browser and wipes the copy on
              the server. There is no second look, so have somewhere to put it
              before you press this.
            </AtDesk>
            <OnPhone>
              Opening it decrypts it here and wipes the copy on the server.
              There is no second look. The link is spent whether the password is
              right or not, and if it's wrong you can try again as long as you
              keep this tab open.
            </OnPhone>
          </>
        ) : (
          "Opening it decrypts it here in your browser and wipes the copy on the server. There is no second look, so have somewhere to put it before you press this."
        )}
      </p>

      {/* Said before the press it is a cost you accept; said after a wrong password it
       * is a trick. It is also the only place "keep this tab open" can be read while
       * the tab is still cheap to keep. */}
      {needsPassword ? (
        <p className={cn(CONSEQUENCE, "hidden md:block")}>
          The link is spent the moment you press, whether the password is right
          or not. If it's wrong you can try again, as long as you keep this tab
          open.
        </p>
      ) : null}
    </div>
  );
}

/*
 * Under the button, the only number this screen is allowed to carry.
 *
 * Sealed, that is the clock, because there is still a server copy for a clock to be
 * about. Spent, the clock is gone and what replaces it is the try count: there is no
 * retry limit and there cannot be one, because we cannot rate-limit what we cannot
 * verify and the ciphertext is in the recipient's own tab, so any counter drawn here is
 * one they could reload away. The count says how many tries have happened, never how
 * many are left.
 *
 * A phone with a field on screen drops the clock, because the keyboard is about to take
 * the room it was standing in.
 */
function Counted({
  expiresAt,
  needsPassword,
  spent,
  tries,
}: {
  expiresAt: string | undefined;
  needsPassword: boolean;
  spent: boolean;
  tries: number;
}) {
  if (spent) {
    return (
      <p className="mt-3 font-mono text-ink-faint text-meta md:mt-4">
        {tries === 1 ? "1 try in this tab" : `${tries} tries in this tab`}
      </p>
    );
  }

  if (expiresAt === undefined) {
    return null;
  }

  return (
    <p
      className={cn(
        "mt-4 font-mono text-ink-faint text-meta md:block",
        needsPassword && "hidden"
      )}
    >
      Expires in {until(expiresAt)} if you don't
    </p>
  );
}

export function Latch({ revealing }: { revealing: Revealing }) {
  const {
    answered,
    busy,
    needsPassword,
    openIt,
    password,
    screen,
    setPassword,
    tries,
    tryAgain,
    unreached,
  } = revealing;

  const atDesk = useAtDesk();
  const field = useRef<HTMLInputElement>(null);
  const spent = screen === "retry";

  /* Arriving in retry puts the caret where the next try goes. */
  useEffect(() => {
    if (spent) {
      field.current?.focus({ preventScroll: true });
    }
  }, [spent]);

  /* And so does a try that did not work: the press may well have come from a pointer,
   * which leaves the caret nowhere near the field it is about to be needed in. */
  async function again() {
    await tryAgain();
    field.current?.focus({ preventScroll: true });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col items-center md:min-h-0">
      <Explain
        field={field}
        needsPassword={needsPassword}
        password={password}
        setPassword={setPassword}
        spent={spent}
      />

      <div className="w-full shrink-0 pt-8 text-center md:max-w-[460px]">
        <Cost needsPassword={needsPassword} spent={spent} />

        <Button
          busy={busy}
          className="mt-4 w-full md:mt-6 md:w-auto"
          disabled={needsPassword && password === ""}
          onClick={spent ? again : openIt}
          size={atDesk ? "md" : "touch"}
        >
          {spent ? "Try again" : "Open it once"}
        </Button>

        <Counted
          expiresAt={answered?.expiresAt}
          needsPassword={needsPassword}
          spent={spent}
          tries={tries}
        />

        {/* On the third try the page admits what it cannot do. Not sooner, because
         * telling somebody they are beyond help on their first mistake is both rude
         * and usually wrong. */}
        {spent ? (
          <Collapse open={tries >= 3}>
            <p className={cn(CONSEQUENCE, "pt-3 md:pt-4")}>
              We can't tell you what the password is and we can't reset it. Ask
              whoever sent it.
            </p>
          </Collapse>
        ) : null}

        {/* A press that reached nothing. The link is untouched, which is the whole
         * point of saying so: the same button tries again. */}
        <Collapse open={unreached}>
          <p className={cn(CONSEQUENCE, "pt-3")}>
            Nothing answered, so nothing was spent. Check your connection and
            press Open it once again.
          </p>
        </Collapse>
      </div>
    </div>
  );
}
