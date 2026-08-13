import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { app } from "../app";
import { closeDatabase } from "../db/client";
import { env } from "../env";

afterAll(closeDatabase);

/*
 * The install handshake, and the token it deliberately drops.
 *
 * The exchange with Slack is the one outbound call this process makes, and there is
 * no way to make it for real from a test: it needs a live app, a live workspace and
 * a code somebody just pressed a button for. So `fetch` is stubbed here, and only
 * here, and only for that one call. The seam is the network, not a module of ours.
 *
 * That stub is also what makes the load-bearing assertion possible. The fake answer
 * carries a bot token, exactly as Slack's does, and the tests then look for that
 * token in everything the route emits. If it appeared in the page, in a header or in
 * the log, one of these would say so.
 *
 * The credentials are set here rather than read from the environment, the way the
 * command tests set the signing secret: one of the branches is having none at all.
 */

const OK = 200;
const FOUND = 302;
const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;
const UNAVAILABLE = 503;

const CLIENT_ID = "2749237413.1234567890";
const CLIENT_SECRET = "e2f1a3c5b7d9081726354453627180ab";

/** What Slack mints and what this route throws away. */
const BOT_TOKEN = "xoxb-2749237413-9182736450-Kq7vRs4WxYz1bCd3EhJk5Ln";

const TEAM = "T024BE91L";

const configured = {
  clientId: env.slack.clientId,
  clientSecret: env.slack.clientSecret,
};

beforeEach(() => {
  env.slack.clientId = CLIENT_ID;
  env.slack.clientSecret = CLIENT_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  env.slack.clientId = configured.clientId;
  env.slack.clientSecret = configured.clientSecret;
});

/** Slack's answer to a completed exchange, with everything it really sends. */
function slackAnswers(body: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body));
}

function granted() {
  return slackAnswers({
    access_token: BOT_TOKEN,
    app_id: "A0001",
    authed_user: { id: "U0001" },
    bot_user_id: "B0001",
    is_enterprise_install: false,
    ok: true,
    scope: "commands",
    team: { id: TEAM, name: "Northwind" },
    token_type: "bot",
  });
}

/** The Add to Slack button, pressed, and wherever it sends the browser. */
async function begin(headers: Record<string, string> = {}) {
  const response = await app.request("/slack/install", { headers });
  const location = response.headers.get("location");

  return {
    authorize: location === null ? null : new URL(location),
    response,
  };
}

/** Slack sending the browser back, with whatever query it comes back carrying. */
function comeBack(query: Record<string, string>) {
  return app.request(
    `/slack/install/callback?${new URLSearchParams(query).toString()}`
  );
}

/** One whole handshake: press the button, then return with the state it minted. */
async function handshake(query: Record<string, string> = {}) {
  const { authorize } = await begin();
  const state = authorize?.searchParams.get("state") ?? "";

  return await comeBack({ code: "6318181906.7418527048", state, ...query });
}

describe("GET /slack/install", () => {
  it("sends the browser to Slack asking for commands and nothing else", async () => {
    const { authorize, response } = await begin();

    expect(response.status).toBe(FOUND);
    expect(authorize?.origin).toBe("https://slack.com");
    expect(authorize?.pathname).toBe("/oauth/v2/authorize");
    expect(authorize?.searchParams.get("scope")).toBe("commands");

    /* Read as the whole list rather than as one absent name: a scope arriving in
     * `user_scope`, or a second one in `scope`, both have to fail here. */
    expect(
      [...(authorize?.searchParams.keys() ?? [])].toSorted()
    ).toStrictEqual(["client_id", "redirect_uri", "scope", "state"]);
  });

  /* A self-hoster is not us, so the address Slack sends the browser back to is
   * whatever this instance is being called rather than one baked in at build time. */
  it("sends Slack back to this instance", async () => {
    const { authorize } = await begin({ "x-forwarded-proto": "https" });

    expect(authorize?.searchParams.get("redirect_uri")).toBe(
      "https://localhost/slack/install/callback"
    );
  });

  it("never lets the redirect be cached", async () => {
    const { response } = await begin();

    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

describe("GET /slack/install/callback", () => {
  it("finishes the install and says which workspace it landed in", async () => {
    granted();

    const response = await handshake();

    expect(response.status).toBe(OK);
    expect(await response.text()).toContain(TEAM);
  });

  it("sends Slack the code and the app's own credentials, and nothing else", async () => {
    const calling = granted();

    await handshake({ code: "6318181906.7418527048" });

    const [url, init] = calling.mock.calls[0] ?? [];
    expect(url).toBe("https://slack.com/api/oauth.v2.access");

    const sent = new URLSearchParams(String(init?.body));
    expect([...sent.keys()].toSorted()).toStrictEqual([
      "client_id",
      "client_secret",
      "code",
      "redirect_uri",
    ]);
    expect(sent.get("code")).toBe("6318181906.7418527048");
  });

  /* Somebody read the permission screen and said no. Nothing failed, and it is not
   * worded as though something did. */
  it("takes a refusal at the permission screen calmly", async () => {
    const response = await handshake({ error: "access_denied" });

    expect(response.status).toBe(OK);
    expect(await response.text()).toContain("Nothing was installed");
  });

  it("reports an exchange Slack would not complete", async () => {
    slackAnswers({ error: "invalid_code", ok: false });

    const response = await handshake();

    expect(response.status).toBe(BAD_GATEWAY);
  });
});

/*
 * The state, which is the whole of what stops a forged callback: this product has
 * no session and sets no cookie, so what a callback has to prove is that the flow
 * it belongs to started on this instance and started recently.
 */
describe("GET /slack/install/callback, and the state it must carry", () => {
  it("refuses a callback carrying no state at all", async () => {
    const calling = granted();

    const response = await comeBack({ code: "6318181906.7418527048" });

    expect(response.status).toBe(BAD_REQUEST);
    expect(calling).not.toHaveBeenCalled();
  });

  it("refuses a state this instance did not mint", async () => {
    const calling = granted();
    const { authorize } = await begin();
    const mine = authorize?.searchParams.get("state") ?? "";

    const refused = await Promise.all([
      comeBack({ code: "1", state: "made-up" }),
      comeBack({ code: "1", state: `${mine}tampered` }),
      comeBack({ code: "1", state: `${Date.now()}.nonce.signature` }),
    ]);

    expect(refused.map((response) => response.status)).toStrictEqual(
      refused.map(() => BAD_REQUEST)
    );
    expect(calling).not.toHaveBeenCalled();
  });

  it("refuses a callback with no code, however good its state is", async () => {
    const calling = granted();
    const { authorize } = await begin();

    const response = await comeBack({
      state: authorize?.searchParams.get("state") ?? "",
    });

    expect(response.status).toBe(BAD_REQUEST);
    expect(calling).not.toHaveBeenCalled();
  });

  /* A state minted under one client secret is worthless under another, which is
   * also what makes a state from somebody else's instance worthless here. */
  it("refuses a state minted against different credentials", async () => {
    const { authorize } = await begin();
    const elsewhere = authorize?.searchParams.get("state") ?? "";

    env.slack.clientSecret = "0000a3c5b7d9081726354453627180ab";
    const calling = granted();

    const response = await comeBack({ code: "1", state: elsewhere });

    expect(response.status).toBe(BAD_REQUEST);
    expect(calling).not.toHaveBeenCalled();
  });
});

/*
 * The point of the whole slice: Slack mints a bot token, this route reads the
 * answer for a team id, and the token stops at the line that reads it.
 */
describe("the token this instance refuses to keep", () => {
  it("puts it in nothing it returns and nothing it writes", async () => {
    granted();
    const wrote = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const printed = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    const response = await handshake();
    const said = await response.text();

    expect(said).toContain(TEAM);
    expect(said).not.toContain(BOT_TOKEN);
    expect(JSON.stringify([...response.headers])).not.toContain(BOT_TOKEN);
    expect(wrote).not.toHaveBeenCalled();
    expect(printed).not.toHaveBeenCalled();
  });

  it("sets no cookie on the way back either", async () => {
    granted();

    const response = await handshake();

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

/*
 * An instance with no client pair. This is every self-hoster: they make their own
 * Slack app from the manifest, install it from their own dashboard, and never come
 * near this route.
 */
describe("an instance with no Slack app configured", () => {
  it("says so rather than half-starting a handshake", async () => {
    env.slack.clientId = undefined;

    const { authorize, response } = await begin();

    expect(response.status).toBe(UNAVAILABLE);
    expect(authorize).toBeNull();
    expect(await response.text()).toContain("no Slack app configured");
  });

  it("says the same thing at the callback", async () => {
    const calling = granted();
    env.slack.clientSecret = undefined;

    const response = await comeBack({ code: "1", state: "anything" });

    expect(response.status).toBe(UNAVAILABLE);
    expect(calling).not.toHaveBeenCalled();
  });
});
