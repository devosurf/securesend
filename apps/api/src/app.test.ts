import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { closeDatabase } from "./db/client";

afterAll(closeDatabase);

describe("GET /api/health", () => {
  it("reports ok while the database answers", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ status: "ok" });
  });
});

describe("unknown api routes", () => {
  it("answer with json rather than the app shell", async () => {
    const response = await app.request("/api/nothing-here");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
