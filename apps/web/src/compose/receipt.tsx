import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { CopyRow } from "../ui/copy-row";
import { Icon, type IconName } from "../ui/icon";
import { LinkSpecimen } from "../ui/link-specimen";
import { Panel } from "../ui/panel";
import { TakeButton } from "../ui/take-button";
import { spokenExpiry, useComposing } from "./composing";

/*
 * The receipt, a third of a second later.
 *
 * It stops being a handoff and becomes the start of a short relationship, because
 * this device now holds the management token: it can watch the secret, and later it
 * will be able to kill it. What is here is the link, what the link will do, and the
 * one sentence explaining where the next visit's status list came from. There is no
 * management URL, no email and no account, so without that sentence the list
 * arrives out of nowhere.
 *
 * The link is shown without its scheme and copied with it. On screen `https://` is
 * fourteen characters of noise in front of the only part that matters; on a
 * clipboard it is what makes the thing a link when it lands in a chat window.
 *
 * It is never truncated, at either width. The frames were drawn against a mock link
 * short enough to fit one line, and a real one is not: the id is about 22 characters
 * and the fragment token runs from 46 to 67, so a single truncated line would end
 * before the hash and show the sender everything except the key, on the screen whose
 * own sentence says the part after the hash is the key. LinkSpecimen breaks it at
 * the hash instead, which is the one joint the link actually has.
 */

function Semantic({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 font-sans text-ink-muted text-small md:items-center">
      <Icon className="mt-0.5 shrink-0 text-ink-faint md:mt-0" name={icon} />
      {children}
    </p>
  );
}

export function Receipt() {
  const { atDesk, copyLink, copied, expiry, link, seal, sendAnother } =
    useComposing();

  if (!link) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <h1 className="font-sans text-heading text-ink-strong">
        Your link is ready.
      </h1>
      <p className="mt-3 max-w-[480px] font-sans text-body text-ink-muted md:mt-4">
        Send it however you normally talk to them.{" "}
        {atDesk
          ? "Paste the whole thing, the part after the hash is the key."
          : "It has to arrive whole, because the part after the hash is the key."}
      </p>

      {atDesk ? (
        <Panel className="mt-8 flex items-center justify-between gap-4 px-4 py-3">
          <LinkSpecimen className="flex-1" value={link.shown} />
          <TakeButton
            className="shrink-0"
            done={copied}
            doneLabel="Copied"
            icon="copy"
            label="Copy link"
            onTake={copyLink}
            size="sm"
          />
        </Panel>
      ) : (
        <Panel className="mt-6 overflow-hidden">
          <CopyRow
            density="touch"
            label="link"
            layout="stacked"
            /* CopyRow shows its tick once this settles, so a browser that refused
             * the write has to leave it unsettled. Otherwise the row says Copied
             * over a clipboard that does not have the link in it. */
            onCopy={async () => {
              if (!(await copyLink())) {
                throw new Error("the clipboard refused the link");
              }
            }}
            shape="link"
            value={link.shown}
            verbatim
          />
        </Panel>
      )}

      {/* The whole feature's cost, and it only appears when the sender took the
       * option. Body, not small: this is not a footnote to the link, it is the
       * second half of the same job. */}
      {seal ? (
        <Panel className="mt-5 bg-surface-sunken px-4 py-4 md:mt-6 md:px-5 md:py-5">
          <h2 className="font-sans font-semibold text-body text-ink">
            Send the password separately.
          </h2>
          <p className="mt-2 font-sans text-body text-ink-muted md:mt-2.5">
            A link and its password in one message is one message that opens the
            secret.
            <span className="hidden md:inline">
              {" "}
              Say it out loud, text it, use a different app. Anything that isn't
              the message carrying the link.
            </span>
            <span className="md:hidden"> Use a different app.</span>
          </p>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-3 pt-6 md:gap-2.5">
        {seal ? (
          <Semantic icon="lock">
            They'll need the password before it opens.
          </Semantic>
        ) : null}
        <Semantic icon="eye-off">
          It opens once. After that it's gone, including for you.
        </Semantic>
        <Semantic icon="clock">
          Expires in {spokenExpiry(expiry)} if nobody opens it.
        </Semantic>
      </div>

      <div className="mt-8 border-hairline border-t pt-5 md:mt-9">
        <p className="pb-5 font-sans text-ink-muted text-small">
          This device is watching it. Come back here to see when it's opened.
        </p>

        <Button
          onClick={sendAnother}
          size={atDesk ? "sm" : "tap"}
          variant="secondary"
        >
          Send another
        </Button>
      </div>
    </div>
  );
}
