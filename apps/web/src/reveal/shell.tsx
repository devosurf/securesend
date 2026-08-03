import type { ReactNode } from "react";
import { RouteLink } from "../lib/route-link";
import { cn } from "../lib/utils";
import { Wordmark } from "../ui/wordmark";

/*
 * The page the recipient lands on, at both widths.
 *
 * One composition serves nine of the eleven screens: a wordmark, whatever the link
 * turned out to be, optically centred, and one way off the page. The two that break
 * out of it are the ones with something to reach for, and they say why where they are.
 *
 * The atmosphere is the only thing that changes here, and it follows the act rather
 * than the page. Sealed, retry and open wear it; every dead end and the saved ending
 * do not, because the burn's whole argument is that finality reads as stillness, and
 * a screen with nothing left to do earns no gradient behind it.
 */

export function AboutLink() {
  return (
    <RouteLink className="text-small" to="/" tone="quiet" viewTransition>
      What is SecureSend?
    </RouteLink>
  );
}

export function Shell({
  floor,
  wash,
  children,
}: {
  /**
   * A band a thumb can reach, pinned below the page on a phone and absent at a desk,
   * where the control it carries belongs inside the panel instead. Giving one is what
   * turns this page into a fixed-height column with its own scroll region, because a
   * floor that scrolls away is not a floor.
   */
  floor?: ReactNode;
  wash: boolean;
  children: ReactNode;
}) {
  const pinned = floor !== undefined;

  return (
    <div
      className={cn(
        "relative flex flex-col bg-bg text-ink",
        pinned
          ? "h-dvh overflow-hidden md:h-auto md:min-h-dvh md:overflow-visible"
          : "min-h-dvh"
      )}
    >
      {/* It fades rather than being dropped: a press that lands on a dead end would
       * otherwise pull the ground out from under the words arriving on top of it. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-[var(--duration-settle)] ease-[var(--ease-in-out-soft)] [background:var(--wash-accent)] motion-reduce:transition-none",
          wash ? "opacity-100" : "opacity-0"
        )}
      />

      <nav className="relative flex shrink-0 items-center px-5 pt-7 md:px-16 md:pt-10">
        <Wordmark />
      </nav>

      <main
        className={cn(
          "relative flex flex-1 flex-col items-center px-5 py-8 md:justify-center md:overflow-visible md:px-6 md:py-10",
          pinned ? "min-h-0 overflow-y-auto" : "justify-center"
        )}
      >
        {children}
      </main>

      {pinned ? (
        <div className="relative flex shrink-0 flex-col items-stretch gap-3 border-hairline border-t bg-surface-sunken px-5 pt-4 pb-6 md:hidden">
          {floor}
        </div>
      ) : null}

      {/* One way off the page, and the floor takes its place when there is one: a
       * phone with a band already has something at the bottom edge. */}
      <footer
        className={cn(
          "relative shrink-0 pb-7 text-center md:pb-9",
          pinned && "hidden md:block"
        )}
      >
        <AboutLink />
      </footer>
    </div>
  );
}

/*
 * Every dead end shares this: centred, light, no panel, because a panel would frame
 * something that could be worked on. Nothing here is red, and nothing is amber except
 * the one screen amber is for.
 */
export function DeadEnd({
  badge,
  body,
  footnote,
  heading,
}: {
  badge?: ReactNode;
  body: string;
  footnote: string;
  heading: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[500px] text-center">
      {badge ? <div className="flex justify-center">{badge}</div> : null}
      <h1
        className={cn(
          "text-balance font-sans text-heading text-ink",
          badge && "mt-6 md:mt-7"
        )}
      >
        {heading}
      </h1>
      <p className="mt-4 text-pretty font-sans text-body text-ink-muted md:mt-5">
        {body}
      </p>
      <p className="mt-7 text-balance font-sans text-ink-faint text-small md:mt-8">
        {footnote}
      </p>
    </div>
  );
}
