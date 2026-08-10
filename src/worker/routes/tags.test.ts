import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Game, GameDetail, Tag } from "../../shared/types";
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
  if (typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
}

async function createGameViaApi(cookie: string, title = "タグテスト用"): Promise<Game> {
  const res = await authedFetch("/api/games", cookie, {
    method: "POST",
    body: JSON.stringify({ title, minPlayers: 2, maxPlayers: 4 }),
  });
  return (await res.json()) as Game;
}

function addTag(gameId: string, cookie: string, name: string) {
  return authedFetch(`/api/games/${gameId}/tags`, cookie, { method: "POST", body: JSON.stringify({ name }) });
}

describe("GET /api/tags", () => {
  it("requires authentication", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/tags`);
    expect(res.status).toBe(401);
  });

  it("returns tags ordered by name", async () => {
    const { cookie } = await createUser("tag-owner-1");
    const game = await createGameViaApi(cookie);
    await addTag(game.id, cookie, "重ゲー");
    await addTag(game.id, cookie, "軽ゲー");

    const res = await authedFetch("/api/tags", cookie);
    const tags = (await res.json()) as Tag[];
    const names = tags.map((t) => t.name);

    expect(names.indexOf("軽ゲー")).toBeLessThan(names.indexOf("重ゲー"));
  });
});

describe("POST /api/games/:id/tags", () => {
  it("creates a new tag and attaches it to the game", async () => {
    const { cookie } = await createUser("tag-owner-2");
    const game = await createGameViaApi(cookie);

    const res = await addTag(game.id, cookie, "協力");

    expect(res.status).toBe(200);
    const tags = (await res.json()) as Tag[];
    expect(tags.map((t) => t.name)).toEqual(["協力"]);
  });

  it("is idempotent when the same tag is attached twice", async () => {
    const { cookie } = await createUser("tag-owner-3");
    const game = await createGameViaApi(cookie);

    await addTag(game.id, cookie, "重ゲー");
    const res = await addTag(game.id, cookie, "重ゲー");

    const tags = (await res.json()) as Tag[];
    expect(tags).toHaveLength(1);
  });

  it("reuses an existing tag across different games instead of creating a duplicate", async () => {
    const { cookie } = await createUser("tag-owner-4");
    const gameA = await createGameViaApi(cookie, "ゲームA");
    const gameB = await createGameViaApi(cookie, "ゲームB");

    const resA = await addTag(gameA.id, cookie, "共通タグ");
    const resB = await addTag(gameB.id, cookie, "共通タグ");
    const tagsA = (await resA.json()) as Tag[];
    const tagsB = (await resB.json()) as Tag[];

    expect(tagsA[0]?.id).toBe(tagsB[0]?.id);

    const allTagsRes = await authedFetch("/api/tags", cookie);
    const allTags = (await allTagsRes.json()) as Tag[];
    expect(allTags.filter((t) => t.name === "共通タグ")).toHaveLength(1);
  });

  it("allows a member who does not own the game to attach a tag", async () => {
    const { cookie: ownerCookie } = await createUser("tag-owner-5");
    const game = await createGameViaApi(ownerCookie);
    const { cookie: otherCookie } = await createUser("tag-other-1");

    const res = await addTag(game.id, otherCookie, "誰でも付けられる");

    expect(res.status).toBe(200);
  });

  it("returns 400 for an empty tag name", async () => {
    const { cookie } = await createUser("tag-owner-6");
    const game = await createGameViaApi(cookie);

    const res = await addTag(game.id, cookie, "   ");

    expect(res.status).toBe(400);
  });

  it("returns 400 for a tag name longer than 30 characters", async () => {
    const { cookie } = await createUser("tag-owner-7");
    const game = await createGameViaApi(cookie);

    const res = await addTag(game.id, cookie, "あ".repeat(31));

    expect(res.status).toBe(400);
  });

  it("returns 404 for a nonexistent game", async () => {
    const { cookie } = await createUser("tag-owner-8");

    const res = await addTag("nonexistent", cookie, "タグ");

    expect(res.status).toBe(404);
  });

  it("returns 403 when Origin does not match", async () => {
    const { cookie } = await createUser("tag-owner-9");
    const game = await createGameViaApi(cookie);

    const res = await SELF.fetch(`${ORIGIN}/api/games/${game.id}/tags`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example.com", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "タグ" }),
    });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/games/:id/tags/:tagId", () => {
  it("removes the tag association", async () => {
    const { cookie } = await createUser("tag-owner-10");
    const game = await createGameViaApi(cookie);
    const addRes = await addTag(game.id, cookie, "外すタグ");
    const tag = ((await addRes.json()) as Tag[])[0];
    if (!tag) throw new Error("tag not created");

    const res = await authedFetch(`/api/games/${game.id}/tags/${tag.id}`, cookie, { method: "DELETE" });
    expect(res.status).toBe(204);

    const detailRes = await authedFetch(`/api/games/${game.id}`, cookie);
    const detail = (await detailRes.json()) as GameDetail;
    expect(detail.tags).toHaveLength(0);
  });

  it("is idempotent when deleting an already-removed association", async () => {
    const { cookie } = await createUser("tag-owner-11");
    const game = await createGameViaApi(cookie);
    const addRes = await addTag(game.id, cookie, "二重削除");
    const tag = ((await addRes.json()) as Tag[])[0];
    if (!tag) throw new Error("tag not created");

    await authedFetch(`/api/games/${game.id}/tags/${tag.id}`, cookie, { method: "DELETE" });
    const res = await authedFetch(`/api/games/${game.id}/tags/${tag.id}`, cookie, { method: "DELETE" });

    expect(res.status).toBe(204);
  });

  it("allows a member who does not own the game to remove a tag", async () => {
    const { cookie: ownerCookie } = await createUser("tag-owner-12");
    const game = await createGameViaApi(ownerCookie);
    const addRes = await addTag(game.id, ownerCookie, "誰でも外せる");
    const tag = ((await addRes.json()) as Tag[])[0];
    if (!tag) throw new Error("tag not created");
    const { cookie: otherCookie } = await createUser("tag-other-2");

    const res = await authedFetch(`/api/games/${game.id}/tags/${tag.id}`, otherCookie, { method: "DELETE" });

    expect(res.status).toBe(204);
  });

  it("returns 404 for a nonexistent game", async () => {
    const { cookie } = await createUser("tag-owner-13");

    const res = await authedFetch("/api/games/nonexistent/tags/nonexistent", cookie, { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});

describe("game responses include tag info", () => {
  it("GET /api/games/:id returns tags sorted by name", async () => {
    const { cookie } = await createUser("tag-owner-14");
    const game = await createGameViaApi(cookie);
    await addTag(game.id, cookie, "重ゲー");
    await addTag(game.id, cookie, "軽ゲー");

    const res = await authedFetch(`/api/games/${game.id}`, cookie);
    const detail = (await res.json()) as GameDetail;

    expect(detail.tags.map((t) => t.name)).toEqual(["軽ゲー", "重ゲー"]);
    expect(detail.tagNames).toEqual(["軽ゲー", "重ゲー"]);
  });

  it("GET /api/games includes ownerName and tagNames", async () => {
    const { cookie } = await createUser("tag-owner-15");
    const game = await createGameViaApi(cookie);
    await addTag(game.id, cookie, "拡張入り");

    const res = await authedFetch("/api/games", cookie);
    const list = (await res.json()) as Game[];
    const found = list.find((g) => g.id === game.id);

    expect(found?.ownerName).toBe("tag-owner-15");
    expect(found?.tagNames).toEqual(["拡張入り"]);
  });
});
