import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Game, GameDetail, GamePhoto } from "../../shared/types";
import { hashSessionId } from "../auth/session";
import type { Bindings } from "../env";

const db = (env as unknown as Bindings).DB;

const ORIGIN = "https://example.com";
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

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

async function createGameViaApi(cookie: string): Promise<Game> {
  const res = await authedFetch("/api/games", cookie, {
    method: "POST",
    body: JSON.stringify({ title: "写真テスト用", minPlayers: 2, maxPlayers: 4 }),
  });
  return (await res.json()) as Game;
}

function jpegBlob(bytes: Uint8Array = JPEG_HEADER): Blob {
  return new Blob([bytes], { type: "image/jpeg" });
}

function uploadPhoto(gameId: string, cookie: string, blob: Blob = jpegBlob()) {
  const form = new FormData();
  form.set("photo", blob, "photo.jpg");
  return authedFetch(`/api/games/${gameId}/photos`, cookie, { method: "POST", body: form });
}

describe("POST /api/games/:id/photos", () => {
  it("uploads a jpeg photo for the game owner", async () => {
    const { cookie } = await createUser("photo-owner-1");
    const game = await createGameViaApi(cookie);

    const res = await uploadPhoto(game.id, cookie);

    expect(res.status).toBe(201);
    const photo = (await res.json()) as GamePhoto;
    expect(photo.url).toBe(`/img/games/${game.id}/${photo.id}.jpg`);
    expect(photo.sortOrder).toBe(0);
  });

  it("allows an admin to upload a photo to someone else's game", async () => {
    const { cookie: ownerCookie } = await createUser("photo-owner-2");
    const game = await createGameViaApi(ownerCookie);
    const { cookie: adminCookie } = await createUser("photo-admin-1", "admin");

    const res = await uploadPhoto(game.id, adminCookie);

    expect(res.status).toBe(201);
  });

  it("allows the registrant to upload a photo to a game they registered for someone else", async () => {
    await createUser("photo-real-owner");
    const { cookie: registrantCookie } = await createUser("photo-registrant");
    const createRes = await authedFetch("/api/games", registrantCookie, {
      method: "POST",
      body: JSON.stringify({ title: "代理登録ゲーム", minPlayers: 2, ownerId: "photo-real-owner" }),
    });
    const game = (await createRes.json()) as Game;

    const res = await uploadPhoto(game.id, registrantCookie);

    expect(res.status).toBe(201);
  });

  it("forbids a different member from uploading a photo", async () => {
    const { cookie: ownerCookie } = await createUser("photo-owner-3");
    const game = await createGameViaApi(ownerCookie);
    const { cookie: otherCookie } = await createUser("photo-other-1");

    const res = await uploadPhoto(game.id, otherCookie);

    expect(res.status).toBe(403);
  });

  it("returns 400 when the file exceeds 2MB", async () => {
    const { cookie } = await createUser("photo-owner-4");
    const game = await createGameViaApi(cookie);
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(JPEG_HEADER);

    const res = await uploadPhoto(game.id, cookie, jpegBlob(big));

    expect(res.status).toBe(400);
  });

  it("returns 400 when the magic bytes are not a jpeg", async () => {
    const { cookie } = await createUser("photo-owner-5");
    const game = await createGameViaApi(cookie);

    const res = await uploadPhoto(game.id, cookie, jpegBlob(new Uint8Array([0x00, 0x01, 0x02])));

    expect(res.status).toBe(400);
  });

  it("returns 400 when content type is not image/jpeg even if bytes match", async () => {
    const { cookie } = await createUser("photo-owner-6");
    const game = await createGameViaApi(cookie);
    const blob = new Blob([JPEG_HEADER], { type: "image/png" });

    const res = await uploadPhoto(game.id, cookie, blob);

    expect(res.status).toBe(400);
  });

  it("returns 400 once the game already has 5 photos", async () => {
    const { cookie } = await createUser("photo-owner-7");
    const game = await createGameViaApi(cookie);

    for (let i = 0; i < 5; i++) {
      const res = await uploadPhoto(game.id, cookie);
      expect(res.status).toBe(201);
    }

    const sixth = await uploadPhoto(game.id, cookie);
    expect(sixth.status).toBe(400);
  });

  it("returns 403 when Origin does not match", async () => {
    const { cookie } = await createUser("photo-owner-8");
    const game = await createGameViaApi(cookie);
    const form = new FormData();
    form.set("photo", jpegBlob(), "photo.jpg");

    const res = await SELF.fetch(`${ORIGIN}/api/games/${game.id}/photos`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example.com" },
      body: form,
    });

    expect(res.status).toBe(403);
  });
});

describe("game detail and list include photo info", () => {
  it("GET /api/games/:id includes photos ordered by sort_order", async () => {
    const { cookie } = await createUser("photo-owner-9");
    const game = await createGameViaApi(cookie);
    await uploadPhoto(game.id, cookie);
    await uploadPhoto(game.id, cookie);

    const res = await authedFetch(`/api/games/${game.id}`, cookie);
    const detail = (await res.json()) as GameDetail;

    expect(detail.photos).toHaveLength(2);
    expect(detail.photos.map((p) => p.sortOrder)).toEqual([0, 1]);
    expect(detail.thumbnailUrl).toBe(detail.photos[0]?.url);
  });

  it("GET /api/games includes thumbnailUrl for games with a photo and null otherwise", async () => {
    const { cookie } = await createUser("photo-owner-10");
    const withPhoto = await createGameViaApi(cookie);
    const withoutPhoto = await createGameViaApi(cookie);
    await uploadPhoto(withPhoto.id, cookie);

    const res = await authedFetch("/api/games", cookie);
    const list = (await res.json()) as Game[];

    expect(list.find((g) => g.id === withPhoto.id)?.thumbnailUrl).not.toBeNull();
    expect(list.find((g) => g.id === withoutPhoto.id)?.thumbnailUrl).toBeNull();
  });
});

describe("DELETE /api/photos/:id", () => {
  it("allows the owner to delete their own photo", async () => {
    const { cookie } = await createUser("photo-owner-11");
    const game = await createGameViaApi(cookie);
    const uploadRes = await uploadPhoto(game.id, cookie);
    const photo = (await uploadRes.json()) as GamePhoto;

    const res = await authedFetch(`/api/photos/${photo.id}`, cookie, { method: "DELETE" });
    expect(res.status).toBe(204);

    const detailRes = await authedFetch(`/api/games/${game.id}`, cookie);
    const detail = (await detailRes.json()) as GameDetail;
    expect(detail.photos).toHaveLength(0);
  });

  it("does not reuse sort_order after deleting the first photo and re-uploading", async () => {
    const { cookie } = await createUser("photo-owner-16");
    const game = await createGameViaApi(cookie);
    const first = (await (await uploadPhoto(game.id, cookie)).json()) as GamePhoto;
    await uploadPhoto(game.id, cookie);
    await uploadPhoto(game.id, cookie);

    const deleteRes = await authedFetch(`/api/photos/${first.id}`, cookie, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);

    const reuploaded = (await (await uploadPhoto(game.id, cookie)).json()) as GamePhoto;

    const detailRes = await authedFetch(`/api/games/${game.id}`, cookie);
    const detail = (await detailRes.json()) as GameDetail;
    const sortOrders = detail.photos.map((p) => p.sortOrder);

    expect(reuploaded.sortOrder).toBe(3);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);

    const listRes = await authedFetch("/api/games", cookie);
    const list = (await listRes.json()) as Game[];
    expect(list.filter((g) => g.id === game.id)).toHaveLength(1);
  });

  it("forbids a different member from deleting someone else's photo", async () => {
    const { cookie: ownerCookie } = await createUser("photo-owner-12");
    const game = await createGameViaApi(ownerCookie);
    const uploadRes = await uploadPhoto(game.id, ownerCookie);
    const photo = (await uploadRes.json()) as GamePhoto;
    const { cookie: otherCookie } = await createUser("photo-other-2");

    const res = await authedFetch(`/api/photos/${photo.id}`, otherCookie, { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("allows an admin to delete someone else's photo", async () => {
    const { cookie: ownerCookie } = await createUser("photo-owner-13");
    const game = await createGameViaApi(ownerCookie);
    const uploadRes = await uploadPhoto(game.id, ownerCookie);
    const photo = (await uploadRes.json()) as GamePhoto;
    const { cookie: adminCookie } = await createUser("photo-admin-2", "admin");

    const res = await authedFetch(`/api/photos/${photo.id}`, adminCookie, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 for a nonexistent photo", async () => {
    const { cookie } = await createUser("photo-owner-14");

    const res = await authedFetch("/api/photos/nonexistent", cookie, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("GET /img/*", () => {
  it("serves the uploaded photo bytes with a long-lived cache header", async () => {
    const { cookie } = await createUser("photo-owner-15");
    const game = await createGameViaApi(cookie);
    const uploadRes = await uploadPhoto(game.id, cookie);
    const photo = (await uploadRes.json()) as GamePhoto;

    const res = await SELF.fetch(`${ORIGIN}${photo.url}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG_HEADER);
  });

  it("returns 404 for a nonexistent key", async () => {
    const res = await SELF.fetch(`${ORIGIN}/img/games/nonexistent/nonexistent.jpg`);
    expect(res.status).toBe(404);
  });
});
