import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { originOf } from "../origin";

/*
 * The install handshake behind the public Add to Slack button.
 *
 * ---- the token this mints is thrown away ------------------------------------
 *
 * A reader will assume the bot token has to be needed for something, so: it is
 * not, and nothing here stores it. The runtime flow holds no token at all. Slack
 * posts a signed request to `/api/slack/command`, we answer that request, and the
 * browser posts the finished link to a one-time reply handle Slack itself sent us.
 * Nothing in this product ever calls Slack's api as an app, so a stored token would
 * be a credential to every workspace that installed us, kept for no reason, waiting
 * in a database whose whole design is that a stolen copy opens nothing.
 *
 * So the exchange is made because Slack requires it to finish an install, its
 * answer is read for the team id and nothing else, and even that is not written
 * anywhere: there is nothing at runtime that would read it back. The team id is the
 * most this instance is ever allowed to keep, and today it keeps less.
 *
 * ---- the state ---------------------------------------------------------------
 *
 * This product has no session and sets no cookie, which the header tests hold it
 * to, so the state cannot be a nonce parked against a browser. It is signed
 * instead: a random value and the time it was issued, with an HMAC over both keyed
 * with the client secret this instance already holds. A callback whose state was
 * not minted by this instance in the last few minutes is refused before anything is
 * exchanged.
 *
 * That is what it buys and it is worth saying what it does not. Without a session
 * there is nothing to bind the state to, so it proves the flow started here rather
 * than that it started in this browser. What makes that enough is that the callback
 * has nothing to give away: it writes nothing, it mints nothing that outlives the
 * response, and a forged one costs an attacker the price of an install into their
 * own workspace.
 *
 * ---- unset credentials --------------------------------------------------------
 *
 * A self-hoster is not us and does not need our client pair. Their own Slack app,
 * made from the manifest in docs/, points at their own instance and needs only a
 * signing secret. So an instance without the pair says exactly that and stops,
 * rather than sending somebody to Slack with half a handshake.
 */

const FOUND = 302;
const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;
const UNAVAILABLE = 503;

const AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const ACCESS = "https://slack.com/api/oauth.v2.access";

/**
 * The only scope this app asks for, and the integrations page says so out loud in
 * its permissions copy. A scope added here makes that page a lie, so adding one is
 * a copy change and a manifest change before it is a code change.
 */
const SCOPE = "commands";

/** How long a state stays good. An install is one redirect and one return. */
const STATE_WINDOW_MS = 10 * 60 * 1000;

const NONCE_BYTES = 16;

const NO_APP =
  "This instance has no Slack app configured. See docs/slack.md: make your own Slack app from the manifest in this repository, point it at this instance, and set SLACK_SIGNING_SECRET.";

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("hex");
}

function mintState(key: string): string {
  const body = `${Date.now()}.${randomBytes(NONCE_BYTES).toString("base64url")}`;

  return `${body}.${sign(body, key)}`;
}

/** Whether this instance minted that state, and recently enough to still mean it. */
function mintedHere(state: string, key: string, now = Date.now()): boolean {
  const [issuedAt, nonce, signature] = state.split(".");

  if (!(issuedAt && nonce && signature)) {
    return false;
  }

  const age = now - Number(issuedAt);
  if (!(Number.isFinite(age) && age >= 0 && age <= STATE_WINDOW_MS)) {
    return false;
  }

  const offered = Buffer.from(signature, "utf8");
  const ours = Buffer.from(sign(`${issuedAt}.${nonce}`, key), "utf8");

  return offered.length === ours.length && timingSafeEqual(offered, ours);
}

/**
 * What is read out of Slack's answer, which is what is kept from it.
 *
 * A plain object rather than a strict one, and that is the point: zod drops every
 * key it was not asked for, so the access token is gone at this line and nothing
 * below it could put the token somewhere even by accident.
 */
const installed = z.object({
  ok: z.literal(true),
  team: z.object({ id: z.string().min(1) }),
});

function redirectUri(c: Context): string {
  return `${originOf(c)}/slack/install/callback`;
}

/** The app's credentials, or null when this instance was never given any. */
function credentials(): { clientId: string; clientSecret: string } | null {
  const { clientId, clientSecret } = env.slack;

  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const install = new Hono()
  .get("/install", (c) => {
    const app = credentials();

    if (!app) {
      return c.text(NO_APP, UNAVAILABLE);
    }

    const authorize = new URL(AUTHORIZE);
    authorize.searchParams.set("client_id", app.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri(c));
    authorize.searchParams.set("scope", SCOPE);
    authorize.searchParams.set("state", mintState(app.clientSecret));

    // The state is good once and for a few minutes, so nothing between here and
    // the browser may keep this answer.
    c.header("Cache-Control", "no-store");

    return c.redirect(authorize.toString(), FOUND);
  })
  .get("/install/callback", async (c) => {
    c.header("Cache-Control", "no-store");

    const app = credentials();

    if (!app) {
      return c.text(NO_APP, UNAVAILABLE);
    }

    // Slack sends this when somebody reads the permission screen and says no,
    // which is not a failure and is not worded as one.
    if (c.req.query("error")) {
      return c.text("Nothing was installed. You can close this tab.");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!(code && state && mintedHere(state, app.clientSecret))) {
      return c.text(
        "That install did not start on this instance. Press Add to Slack again.",
        BAD_REQUEST
      );
    }

    const answered = await fetch(ACCESS, {
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        redirect_uri: redirectUri(c),
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });

    /* Slack answers 200 with `ok: false` for a refused exchange, so the status is
     * not the thing to read. Nothing of what came back is quoted into the page or
     * the log either way: the body is a bot token wrapped in an envelope. */
    const read = installed.safeParse(await answered.json().catch(() => null));

    if (!read.success) {
      return c.text(
        "Slack did not complete the install. Try Add to Slack again.",
        BAD_GATEWAY
      );
    }

    return c.text(
      [
        `SecureSend is installed in ${read.data.team.id}.`,
        "",
        "Type /ss in any channel. The secret itself is typed in a SecureSend",
        "window rather than in Slack, and only the finished link comes back.",
        "",
        "Nothing was stored here, and the token Slack just minted was thrown",
        "away: this app never calls Slack as itself, so there is nothing a kept",
        "token would be for.",
      ].join("\n")
    );
  });
