import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Game } from "../../shared/types";
import { hashSessionId } from "../auth/session";
import type { Bindings } from "../env";

const db = (env as unknown as Bindings).DB;

const ORIGIN = "https://example.com";

async function createUser(id: string, role: "member" | "admin" = "member") {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO users (id, username, display_name, avatar_url, role, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, id, id, null, role, now, now, now)
    .run();

  const rawSessionId = `session-${id}`;
  const idHash = await hashSessionId(rawSessionId);
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(idHash, id, now + 1000, now)
    .run();

  return { cookie: `__Host-session=${rawSessionId}` };
}

function authedFetch(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  if (init.method && init.method !== "GET") {
    headers.set("Origin", ORIGIN);
  }
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
}

const validGame = {
  title: "カタン",
  minPlayers: 3,
  maxPlayers: 4,
};

async function createGameViaApi(cookie: string, body: Record<string, unknown> = validGame): Promise<Game> {
  const res = await authedFetch("/api/games", cookie, { method: "POST", body: JSON.stringify(body) });
  return (await res.json()) as Game;
}

describe("POST /api/games", () => {
  it("creates a game owned by the current user", async () => {
    const { cookie } = await createUser("owner-1");

    const res = await authedFetch("/api/games", cookie, {
      method: "POST",
      body: JSON.stringify(validGame),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ownerId: "owner-1",
      title: "カタン",
      minPlayers: 3,
      maxPlayers: 4,
      status: "available",
    });
  });

  it("returns 400 when title is missing", async () => {
    const { cookie } = await createUser("owner-2");

    const res = await authedFetch("/api/games", cookie, {
      method: "POST",
      body: JSON.stringify({ minPlayers: 2, maxPlayers: 4 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when minPlayers is missing", async () => {
    const { cookie } = await createUser("owner-2b");

    const res = await authedFetch("/api/games", cookie, {
      method: "POST",
      body: JSON.stringify({ title: "人数なしゲーム" }),
    });

    expect(res.status).toBe(400);
  });

  it("creates a game without maxPlayers (no upper limit)", async () => {
    const { cookie } = await createUser("owner-2c");

    const res = await authedFetch("/api/games", cookie, {
      method: "POST",
      body: JSON.stringify({ title: "上限なしゲーム", minPlayers: 2 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ minPlayers: 2, maxPlayers: null });
  });

  it("returns 400 when minPlayers is greater than maxPlayers", async () => {
    const { cookie } = await createUser("owner-3");

    const res = await authedFetch("/api/games", cookie, {
      method: "POST",
      body: JSON.stringify({ title: "変なゲーム", minPlayers: 5, maxPlayers: 2 }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 403 when Origin does not match", async () => {
    const { cookie } = await createUser("owner-4");

    const res = await SELF.fetch(`${ORIGIN}/api/games`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example.com", "Content-Type": "application/json" },
      body: JSON.stringify(validGame),
    });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/games", () => {
  it("lists active games, newest first, and excludes soft-deleted games", async () => {
    const { cookie } = await createUser("owner-5");

    const firstBody = await createGameViaApi(cookie, { title: "古いゲーム", minPlayers: 2, maxPlayers: 4 });
    const secondBody = await createGameViaApi(cookie, { title: "新しいゲーム", minPlayers: 2, maxPlayers: 4 });

    await authedFetch(`/api/games/${firstBody.id}`, cookie, { method: "DELETE" });

    const listRes = await authedFetch("/api/games", cookie);
    const list: Array<{ id: string; createdAt: number }> = await listRes.json();
    const ids = list.map((g) => g.id);

    expect(ids).not.toContain(firstBody.id);
    expect(ids).toContain(secondBody.id);
    const createdAts = list.map((g) => g.createdAt);
    expect(createdAts).toEqual([...createdAts].sort((a, b) => b - a));
  });
});

describe("GET /api/games/:id", () => {
  it("returns 404 for a nonexistent game", async () => {
    const { cookie } = await createUser("owner-6");

    const res = await authedFetch("/api/games/nonexistent", cookie);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("PATCH /api/games/:id", () => {
  it("allows the owner to update their own game", async () => {
    const { cookie } = await createUser("owner-7");
    const game = await createGameViaApi(cookie);

    const patchRes = await authedFetch(`/api/games/${game.id}`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ note: "拡張入り" }),
    });

    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as Game).note).toBe("拡張入り");
  });

  it("forbids a different member from updating someone else's game", async () => {
    const { cookie: ownerCookie } = await createUser("owner-8");
    const game = await createGameViaApi(ownerCookie);

    const { cookie: otherCookie } = await createUser("other-1");
    const patchRes = await authedFetch(`/api/games/${game.id}`, otherCookie, {
      method: "PATCH",
      body: JSON.stringify({ note: "勝手に変更" }),
    });

    expect(patchRes.status).toBe(403);
  });

  it("allows an admin to update someone else's game", async () => {
    const { cookie: ownerCookie } = await createUser("owner-9");
    const game = await createGameViaApi(ownerCookie);

    const { cookie: adminCookie } = await createUser("admin-1", "admin");
    const patchRes = await authedFetch(`/api/games/${game.id}`, adminCookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "retired" }),
    });

    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as Game).status).toBe("retired");
  });
});

describe("DELETE /api/games/:id", () => {
  it("forbids a different member from deleting someone else's game", async () => {
    const { cookie: ownerCookie } = await createUser("owner-10");
    const game = await createGameViaApi(ownerCookie);

    const { cookie: otherCookie } = await createUser("other-2");
    const deleteRes = await authedFetch(`/api/games/${game.id}`, otherCookie, { method: "DELETE" });

    expect(deleteRes.status).toBe(403);
  });

  it("soft-deletes the game so it 404s afterwards", async () => {
    const { cookie } = await createUser("owner-11");
    const game = await createGameViaApi(cookie);

    const deleteRes = await authedFetch(`/api/games/${game.id}`, cookie, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);

    const getRes = await authedFetch(`/api/games/${game.id}`, cookie);
    expect(getRes.status).toBe(404);
  });
});
