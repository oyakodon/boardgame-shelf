import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await SELF.fetch("https://example.com/api/health");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("unauthenticated requests to protected routes", () => {
  it("GET /api/me returns 401 json", async () => {
    const res = await SELF.fetch("https://example.com/api/me");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("POST /auth/logout returns 401 json", async () => {
    const res = await SELF.fetch("https://example.com/auth/logout", { method: "POST" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("GET /api/games returns 401 json", async () => {
    const res = await SELF.fetch("https://example.com/api/games");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("unimplemented /api and /auth routes", () => {
  it("GET /api/nonexistent returns 404 json instead of falling back to assets", async () => {
    const res = await SELF.fetch("https://example.com/api/nonexistent");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("GET /auth/nonexistent returns 404 json instead of falling back to assets", async () => {
    const res = await SELF.fetch("https://example.com/auth/nonexistent");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
