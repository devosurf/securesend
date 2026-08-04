import { zValidator } from "@hono/zod-validator";
import { isSecretId } from "@securesend/crypto/ids";
import { Hono } from "hono";
import { z } from "zod";
import { buckets, perCaller } from "../limits/gates";
import { lookUp, lookUpAll, MAX_STATUS_IDS } from "./state";

/*
 * Asking about a secret without touching it.
 *
 * This is the route a stranger is expected to hit. A link pasted into Slack, Teams
 * or iMessage is fetched by a preview bot before a human sees it, and a product
 * whose links die on the first fetch would lose secrets to robots. So this route
 * reads and answers, and there is no code path from here to a write.
 *
 * There are two shapes because there are two callers. The recipient's sealed page
 * asks about one id. A sender's browser asks about the handful it remembers, and a
 * list of ids does not fit honestly in a url, so that one arrives in a body. It is
 * still a lookup: a POST here changes nothing at all.
 *
 * An id nothing was stored under and a string that is not an id both answer the
 * same way, which is what stops this route teaching the id format to somebody
 * probing it.
 */

const NOT_FOUND = 404;
const BAD_REQUEST = 400;

const statusesBody = z.strictObject({
  ids: z
    .array(z.string().refine(isSecretId, "not an id this product generates"))
    .min(1)
    .max(MAX_STATUS_IDS),
});

/*
 * Both shapes take the same gate, and it is the most generous of the three: this is
 * the route a preview bot lands on and the route every arriving recipient reads, so it
 * is the one an office behind one address hits most.
 */
export const status = new Hono()
  .get("/:id", perCaller(buckets.statuses), async (c) => {
    const id = c.req.param("id");

    // Refused before the query rather than by it: a lookup should not put an
    // arbitrary string from the url into the database at all.
    const found = isSecretId(id) ? await lookUp(id) : null;

    return found
      ? c.json(found)
      : c.json({ error: "there is nothing at this link" }, NOT_FOUND);
  })
  .post(
    "/statuses",
    perCaller(buckets.statuses),
    zValidator("json", statusesBody, (result, c) =>
      result.success
        ? undefined
        : c.json({ error: "that is not a list of secret ids" }, BAD_REQUEST)
    ),
    async (c) => {
      const { ids } = c.req.valid("json");

      return c.json({ secrets: await lookUpAll(ids) });
    }
  );
