/*
 * How long ago, and how long left, in the words the interface says them in.
 *
 * One number and one unit, always, because every sentence these land in is a whole
 * sentence about something else: "It was used 14 minutes ago", "21 hours left",
 * "Expires in 43 minutes if you don't". A second unit would make those read like a
 * stopwatch, and none of them is precise enough to deserve one.
 *
 * Both round down, so nothing here ever over-promises. Twenty-three and a half hours
 * left is twenty-three hours left: the sender who reads it and comes back tomorrow
 * finds the secret still there rather than gone an hour before they were told.
 *
 * How long is left is never counted in days, and that is the expiry ceiling showing
 * through rather than a formatting choice. Nothing in this product lives past 72
 * hours, so hours is the honest unit for the whole of a secret's life, and a row
 * saying "3 days left" would be a row about a product that does not exist. How long
 * ago does count in days, because a tombstone outlives its secret by a week.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function count(many: number, unit: string): string {
  return many === 1 ? `1 ${unit}` : `${many} ${unit}s`;
}

/** How long until an instant, bare, for a caller to put its own words around. */
export function until(iso: string, now = Date.now()): string {
  const left = Date.parse(iso) - now;

  if (Number.isNaN(left) || left < MINUTE) {
    return "under a minute";
  }

  return left < HOUR
    ? count(Math.floor(left / MINUTE), "minute")
    : count(Math.floor(left / HOUR), "hour");
}

/** How long since an instant, as a whole phrase, because "just now" is one. */
export function since(iso: string, now = Date.now()): string {
  const gone = now - Date.parse(iso);

  if (Number.isNaN(gone) || gone < MINUTE) {
    return "just now";
  }
  if (gone < HOUR) {
    return `${count(Math.floor(gone / MINUTE), "minute")} ago`;
  }

  return gone < DAY
    ? `${count(Math.floor(gone / HOUR), "hour")} ago`
    : `${count(Math.floor(gone / DAY), "day")} ago`;
}

/**
 * Which of the three expiries a secret was created with, said the way the sender
 * chose it. Derived from the two timestamps rather than stored, because the instance
 * has no reason to keep the preset once it has a deadline, and the nearest of three
 * is unambiguous when the gap between them is an order of magnitude.
 */
export function preset(createdAt: string, expiresAt: string): string {
  const hours = (Date.parse(expiresAt) - Date.parse(createdAt)) / HOUR;
  const nearest = [1, 24, 72].reduce((best, option) =>
    Math.abs(option - hours) < Math.abs(best - hours) ? option : best
  );

  return count(nearest, "hour");
}
