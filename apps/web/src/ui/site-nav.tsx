import { LINKS, OUTBOUND } from "../lib/links";
import { RouteLink } from "../lib/route-link";
import { TextLink } from "./text-link";
import { Wordmark } from "./wordmark";

/*
 * The nav every page that has one wears, written once.
 *
 * Three destinations, in this order, at every width. Integrations answers "can I
 * use it from where I am", and Security and Self-host both answer "should I trust
 * this", which is the question a reader asks second. Self-host is no longer a desk
 * only item: a reader on a phone is the one most likely to be checking whether
 * this is a service or a thing they can run.
 *
 * Self-host leaves for the repository from all three pages. It used to be an
 * in-page anchor on the homepage, because the homepage has that section, and a nav
 * item whose destination changes depending on which page you press it from is
 * exactly the drift one shared nav exists to stop.
 *
 * The current page is a span rather than a link. A nav item that navigates to the
 * page you are standing on is a press that does nothing.
 *
 * A detail page under Integrations does not pass `current`: a reader there needs
 * the way back up, so Integrations stays a live link everywhere except on the
 * index page itself.
 */

/**
 * The two destinations inside this site, in the order they are worn.
 *
 * One list rather than two written-out items, so the order is a fact rather than
 * a coincidence of how the markup happens to be arranged, and so a third one
 * cannot be added to the nav and forgotten in the audit that reads it back.
 */
const DESTINATIONS = [
  { label: "Integrations", to: "/integrations" },
  { label: "Security", to: "/security" },
] as const;

/** A page this nav can be standing on. The homepage is on none of them. */
export type NavPage = (typeof DESTINATIONS)[number]["label"];

export function SiteNav({ current }: { current?: NavPage }) {
  return (
    <nav className="relative flex shrink-0 items-center justify-between px-5 pt-7 md:px-16 md:pt-10">
      <RouteLink to="/" tone="quiet" viewTransition>
        <Wordmark />
      </RouteLink>
      {/* Tighter at 390, where three items plus the wordmark have 350px between
       * them and the desk's gap would push the last one off the edge. */}
      <div className="flex items-center gap-5 md:gap-8">
        {DESTINATIONS.map(({ label, to }) =>
          label === current ? (
            <span
              aria-current="page"
              className="font-sans text-ink text-small"
              key={label}
            >
              {label}
            </span>
          ) : (
            <RouteLink
              className="text-small"
              key={label}
              to={to}
              tone="quiet"
              viewTransition
            >
              {label}
            </RouteLink>
          )
        )}

        <TextLink
          className="text-small"
          href={LINKS.selfHosting}
          tone="quiet"
          {...OUTBOUND}
        >
          Self-host
        </TextLink>
      </div>
    </nav>
  );
}
