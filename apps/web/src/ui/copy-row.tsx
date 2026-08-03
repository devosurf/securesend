import { useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { LinkSpecimen } from "./link-specimen";

/*
 * One part of a secret, on one line, with its own copy button.
 *
 * This is the primitive the whole "structured secret" bet rests on. A wall of
 * text makes the recipient select the password out of a paragraph by hand; a row
 * makes it one click, and the label says which part is which without the sender
 * writing "user:" in front of it.
 *
 * Masked is the same row with the value hidden until asked for. It is not
 * security theatre: the recipient is often on a shared screen, and a password
 * that paints itself the moment the page loads is the one real complaint about
 * every reveal page in this category.
 *
 * Copying is the screen's job, not this component's: shared UI takes props, never
 * knowledge, so the clipboard call arrives as onCopy. The copied state is only
 * shown once that promise settles, so the tick never lies.
 *
 * --- the two phone affordances -------------------------------------------
 *
 * `density="touch"` grows the hit area of Copy and Show without growing how loud
 * they look. The padding goes up, the type barely moves, and a negative margin
 * pulls the taller control back so the row keeps its desk rhythm. At rest the
 * phone row looks like the desk row; the difference only exists under a finger,
 * which is where it was missing.
 *
 * `verbatim` is for the value someone may have to read out or type by hand, which
 * in practice means the password. Three things have to be true of it and none of
 * them are true of a plain wrapping value:
 *
 *   it never truncates      an ellipsis in a password is a lie about its content
 *   its end is unambiguous  a wrapped value has to say where the last character
 *                           is, or a trailing space reads as nothing at all
 *   a wrap is not a space   which is why it sits in its own sunken block: a line
 *                           break inside a visible container reads as a wrap,
 *                           where a break in loose text reads as a word gap
 *
 * So verbatim gives the value a ground of its own, breaks by character rather
 * than truncating, closes on a hairline terminator, and puts the character count
 * beside the label so the reader can check they got all of it.
 *
 * `shape="link"` keeps every one of those promises and only changes where the
 * break lands. Breaking a URL by character cuts the key at an arbitrary position;
 * a link has one real joint and it is the hash. LinkSpecimen owns that rule so
 * the two screens showing this same string cannot drift apart.
 */

const COPIED_MS = 1600;

export interface CopyRowProps {
  className?: string;
  /** Touch gives Copy and Show a finger-sized target at the same visual weight. */
  density?: "default" | "touch";
  label: string;
  /** Stacked is the phone: the label sits above the value instead of beside it. */
  layout?: "row" | "stacked";
  masked?: boolean;
  onCopy?: (value: string) => Promise<void> | void;
  /** A link breaks at its hash, not mid-key. Verbatim only. */
  shape?: "text" | "link";
  /** Prose reads as prose. Machine-shaped values read as mono. */
  tone?: "mono" | "prose";
  value: string;
  /** The value must survive being read character by character. See above. */
  verbatim?: boolean;
}

function Value({
  value,
  tone,
  verbatim,
  hidden,
  asLink,
}: {
  value: string;
  tone: "mono" | "prose";
  verbatim: boolean;
  hidden: boolean;
  asLink: boolean;
}) {
  if (asLink) {
    return <LinkSpecimen terminator value={value} />;
  }

  const text = hidden ? "•".repeat(value.length) : value;

  return (
    <span
      className={cn(
        "block min-w-0",
        verbatim ? "whitespace-pre-wrap break-all" : "break-words",
        tone === "mono"
          ? "font-mono text-[14px] text-ink leading-[1.55] tracking-tight"
          : "font-sans text-[15px] text-ink leading-[1.6]",
        hidden && "select-none text-ink-faint"
      )}
    >
      {text}
      {verbatim ? (
        /* The terminator. It sits after the last character wherever the wrap put
         * it, so "where does this end" is answered by the value itself rather
         * than by counting. */
        <span
          aria-hidden="true"
          className="ml-[3px] inline-block h-[1em] w-px translate-y-[0.15em] bg-ink-faint"
        />
      ) : null}
    </span>
  );
}

function Actions({
  masked,
  shown,
  copied,
  touch,
  onShow,
  onCopy,
}: {
  masked: boolean;
  shown: boolean;
  copied: boolean;
  touch: boolean;
  onShow: () => void;
  onCopy: () => void;
}) {
  const size = touch ? "tap" : "sm";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        touch ? "-my-2.5 gap-0" : "gap-0.5"
      )}
    >
      {masked ? (
        <Button
          aria-label={shown ? "Hide" : "Show"}
          className="gap-1.5"
          onClick={onShow}
          size={size}
          variant="ghost"
        >
          <Icon name={shown ? "eye-off" : "eye"} />
          {shown ? "Hide" : "Show"}
        </Button>
      ) : null}
      <Button
        className={cn("gap-1.5", copied && "text-accent hover:text-accent")}
        onClick={onCopy}
        size={size}
        variant="ghost"
      >
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function CopyRow({
  label,
  value,
  tone = "mono",
  masked = false,
  layout = "row",
  density = "default",
  verbatim = false,
  shape = "text",
  onCopy,
  className,
}: CopyRowProps) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);

  async function handleCopy() {
    try {
      await onCopy?.(value);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch (error) {
      console.error(error);
    }
  }

  function handleShow() {
    setShown(!shown);
  }

  const touch = density === "touch";
  const hidden = masked && !shown;

  const body = (
    <Value
      asLink={verbatim && shape === "link" && !hidden}
      hidden={hidden}
      tone={tone}
      value={value}
      verbatim={verbatim}
    />
  );

  const valueBlock = verbatim ? (
    <div className="rounded-inner bg-surface-sunken px-3 py-2.5">{body}</div>
  ) : (
    body
  );

  const actions = (
    <Actions
      copied={copied}
      masked={masked}
      onCopy={handleCopy}
      onShow={handleShow}
      shown={shown}
      touch={touch}
    />
  );

  if (layout === "stacked") {
    return (
      <div className={cn("px-5 py-4", className)}>
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            touch && "-mr-3.5"
          )}
        >
          {/* Abbreviated, because at 390 the label shares its line with Show and
           * Copy and "19 characters" wraps the label onto two. A count in mono
           * meta beside a mono value is unambiguous at "chars". */}
          <span className="whitespace-nowrap font-mono text-ink-faint text-meta lowercase">
            {label}
            {verbatim ? ` · ${value.length} chars` : null}
          </span>
          {actions}
        </div>
        <div className={cn(verbatim ? "mt-2.5" : "mt-2")}>{valueBlock}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[92px_minmax(0,1fr)_auto] items-start gap-x-4 px-5 py-4",
        className
      )}
    >
      <span className="mt-[3px] font-mono text-ink-faint text-meta lowercase">
        {label}
      </span>
      <div className="min-w-0 pt-px">{valueBlock}</div>
      <div className={cn("-mr-1.5", !touch && "-mt-1")}>{actions}</div>
    </div>
  );
}
