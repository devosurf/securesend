import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../lib/utils";

/*
 * Two link registers, because the product has two audiences on one page.
 *
 *   accent  a real destination the reader is meant to take
 *   quiet   navigation and the dev-proof layer: findable, never in the
 *           recipient's face
 */
export type LinkTone = "accent" | "quiet";

function linkClass(tone: LinkTone, className?: string) {
  return cn(
    "font-sans transition-colors duration-[var(--duration-instant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2",
    tone === "accent"
      ? "text-accent underline underline-offset-2 hover:text-accent-hover"
      : "text-ink-muted hover:text-ink",
    className
  );
}

export type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone?: LinkTone;
  /* Spelled out rather than inherited, so the router's own link can wear this
   * look: it hands the anchor a ref to measure and preload from. */
  ref?: Ref<HTMLAnchorElement> | undefined;
};

export function TextLink({
  className,
  tone = "accent",
  ref,
  ...props
}: TextLinkProps) {
  return <a className={linkClass(tone, className)} ref={ref} {...props} />;
}

/*
 * The same look worn by a real button, for an inline action that does something
 * to this page rather than going anywhere.
 *
 * It exists because the alternative is an `<a href="#">` with an onClick, and
 * that lies twice: it offers "open in new tab" on a thing that is not a page,
 * and it puts a click in browser history that the back button can't undo. "Check
 * again" on the sender's ledger is the case that forced it. Both registers share
 * one class function above so the action can never drift away from the links it
 * sits in a sentence with.
 */
export type TextActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: LinkTone;
};

export function TextAction({
  className,
  tone = "accent",
  ...props
}: TextActionProps) {
  return (
    <button className={linkClass(tone, className)} type="button" {...props} />
  );
}
