import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../env";
import { hashSessionId } from "./session";

const db = (env as unknown as Bindings).DB;

function extractCookie(res: Response, name: string): string {
  const setCookieHeaders = res.headers.getSetCookie();
  const match = setCookieHeaders.find((cookie) => cookie.startsWith(`${name}=`));
  if (!match) {
    throw new Error(`cookie ${name} not found in Set-Cookie headers: ${JSON.stringify(setCookieHeaders)}`);
  }
  return match.split(";")[0];
}

function mockDiscordFetch(guildStatus: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "token-abc" }), { status: 200 });
      }
      if (url.includes("/guilds/")) {
        return new Response(guildStatus === 200 ? "{}" : "not found", { status: guildStatus });
      }
      if (url.includes("/users/@me")) {
        return new Response(
          JSON.stringify({ id: "discord-user-1", username: "alice", global_name: "Alice", avatar: null }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /auth/login", () => {
  it("redirects to the discord authorize URL and sets an oauth_state cookie", async () => {
    const res = await SELF.fetch("https://example.com/auth/login", { redirect: "manual" });

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(extractCookie(res, "__Host-oauth_state")).toBeTruthy();
  });
});

describe("GET /auth/callback", () => {
  it("creates a user, a session, and redirects to / on success", async () => {
    const loginRes = await SELF.fetch("https://example.com/auth/login", { redirect: "manual" });
    const stateCookie = extractCookie(loginRes, "__Host-oauth_state");
    const state = new URL(loginRes.headers.get("location") ?? "").searchParams.get("state") ?? "";

    mockDiscordFetch(200);

    const res = await SELF.fetch(`https://example.com/auth/callback?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: stateCookie },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(extractCookie(res, "__Host-session")).toBeTruthy();

    const row = await db.prepare("SELECT id, role FROM users WHERE id = ?").bind("discord-user-1").first();
    expect(row).toMatchObject({ id: "discord-user-1", role: "member" });
  });

  it("returns 400 when state does not match the saved cookie", async () => {
    const res = await SELF.fetch("https://example.com/auth/callback?code=abc&state=mismatched", {
      redirect: "manual",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid oauth state" });
  });

  it("returns 403 when the user is not a member of the target guild", async () => {
    const loginRes = await SELF.fetch("https://example.com/auth/login", { redirect: "manual" });
    const stateCookie = extractCookie(loginRes, "__Host-oauth_state");
    const state = new URL(loginRes.headers.get("location") ?? "").searchParams.get("state") ?? "";

    mockDiscordFetch(404);

    const res = await SELF.fetch(`https://example.com/auth/callback?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: stateCookie },
      redirect: "manual",
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not a guild member" });
  });
});

describe("GET /api/me and POST /auth/logout", () => {
  it("returns the current user for a valid session, enforces Origin on logout, then 401s afterwards", async () => {
    const now = Math.floor(Date.now() / 1000);
    await db
      .prepare(
        `INSERT INTO users (id, username, display_name, avatar_url, role, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind("user-1", "bob", "Bob", null, "member", now, now, now)
      .run();

    const rawSessionId = "test-raw-session-id";
    const idHash = await hashSessionId(rawSessionId);
    await db
      .prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(idHash, "user-1", now + 1000, now)
      .run();

    const cookie = `__Host-session=${rawSessionId}`;

    const meRes = await SELF.fetch("https://example.com/api/me", { headers: { Cookie: cookie } });
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toEqual({
      id: "user-1",
      username: "bob",
      displayName: "Bob",
      avatarUrl: null,
      role: "member",
    });

    const forbiddenRes = await SELF.fetch("https://example.com/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example.com" },
    });
    expect(forbiddenRes.status).toBe(403);

    const logoutRes = await SELF.fetch("https://example.com/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://example.com" },
    });
    expect(logoutRes.status).toBe(204);

    const afterLogoutRes = await SELF.fetch("https://example.com/api/me", { headers: { Cookie: cookie } });
    expect(afterLogoutRes.status).toBe(401);
  });
});
