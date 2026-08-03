import { cn } from "../lib/utils";

/*
 * A one-time link, shown whole, broken where the link is actually jointed.
 *
 * A URL made of slashes and random characters offers a browser no break it will
 * take, so at 390 it either runs off the side or, once it is told to break by
 * character, snaps somewhere arbitrary: securesend.dev/s/7hK2mQ#k3x / Rv9LpQe2mAw
 * cuts the key in half at a position that means nothing. The link has exactly one
 * real joint, the hash, and it is the joint every screen that shows this string
 * is already talking about. So the break goes there: the address on one line, the
 * key on the next, both breaking by character so neither can escape the width
 * again.
 *
 * Two tones, because two screens show the same string for opposite reasons.
 *
 *   plain    the sender's own link. Two lines, one colour. The key is not
 *            optional and any treatment that sets it apart says it is.
 *   anatomy  the teaching case, where the screen's whole job is naming which end
 *            went missing, so the key is in accent and the address recedes.
 *            Accent is doing its ordinary job here, pointing at the live part.
 *            Nothing on that screen is red and nothing failed.
 *
 * The terminator is verbatim's promise, not this component's habit: a hairline
 * after the true last character, so a wrapped value says where it ends. It is off
 * unless asked for.
 */

export interface LinkSpecimenProps {
  className?: string;
  /** The hairline after the last character. See verbatim in CopyRow. */
  terminator?: boolean;
  tone?: "plain" | "anatomy";
  value: string;
}

const LINE = "break-all font-mono text-[14px] leading-[1.55] tracking-tight";

export function LinkSpecimen({
  value,
  tone = "plain",
  terminator = false,
  className,
}: LinkSpecimenProps) {
  const joint = value.indexOf("#");
  const address = joint === -1 ? value : value.slice(0, joint);
  const key = joint === -1 ? "" : value.slice(joint);
  const anatomy = tone === "anatomy";

  const end = terminator ? (
    <span
      aria-hidden="true"
      className="ml-[3px] inline-block h-[1em] w-px translate-y-[0.15em] bg-ink-faint"
    />
  ) : null;

  /* The terminator closes the last line there is, which is the address only when
   * the value carries no key. */
  const addressEnd = key ? null : end;

  return (
    <div className={cn("min-w-0", className)}>
      <p className={cn(LINE, anatomy ? "text-ink-faint" : "text-ink")}>
        {address}
        {addressEnd}
      </p>
      {key ? (
        <p className={cn(LINE, anatomy ? "text-accent" : "text-ink")}>
          {key}
          {end}
        </p>
      ) : null}
    </div>
  );
}
