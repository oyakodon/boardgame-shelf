import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { Game } from "../../shared/types";
import type { Bindings } from "../env";
import { authedFetch, createUser, ORIGIN } from "../test-helpers";

const bindings = env as unknown as Bindings;
const TEST_ADMIN_TOKEN = "test-admin-token";

function bearerFetch(path: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
}

async function createGameViaApi(cookie: string): Promise<Game> {
  const res = await authedFetch("/api/games", cookie, {
    method: "POST",
    body: JSON.stringify({ title: "adminトークンテスト用", minPlayers: 2, maxPlayers: 4 }),
  });
  return (await res.json()) as Game;
}

afterEach(() => {
  bindings.ADMIN_API_TOKEN = "";
  bindings.ADMIN_DISCORD_IDS = "";
});

describe("authenticateWithAdminToken", () => {
  it("allows a PATCH request with the correct admin token", async () => {
    bindings.ADMIN_API_TOKEN = TEST_ADMIN_TOKEN;
    bindings.ADMIN_DISCORD_IDS = "admin-token-user-1";
    await createUser("admin-token-user-1", "admin");
    const { cookie } = await createUser("owner-for-admin-token-1");
    const game = await createGameViaApi(cookie);

    const res = await bearerFetch(`/api/games/${game.id}`, TEST_ADMIN_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ note: "adminトークンで更新" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 401 for an incorrect admin token", async () => {
    bindings.ADMIN_API_TOKEN = TEST_ADMIN_TOKEN;
    bindings.ADMIN_DISCORD_IDS = "admin-token-user-2";
    await createUser("admin-token-user-2", "admin");
    const { cookie } = await createUser("owner-for-admin-token-2");
    const game = await createGameViaApi(cookie);

    const res = await bearerFetch(`/api/games/${game.id}`, "wrong-token", {
      method: "PATCH",
      body: JSON.stringify({ note: "更新できないはず" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the first ADMIN_DISCORD_IDS user does not exist in users", async () => {
    bindings.ADMIN_API_TOKEN = TEST_ADMIN_TOKEN;
    bindings.ADMIN_DISCORD_IDS = "nonexistent-admin-id";
    const { cookie } = await createUser("owner-for-admin-token-3");
    const game = await createGameViaApi(cookie);

    const res = await bearerFetch(`/api/games/${game.id}`, TEST_ADMIN_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ note: "更新できないはず" }),
    });

    expect(res.status).toBe(401);
  });

  it("allows a mutating request via Bearer auth even when Origin does not match", async () => {
    bindings.ADMIN_API_TOKEN = TEST_ADMIN_TOKEN;
    bindings.ADMIN_DISCORD_IDS = "admin-token-user-4";
    await createUser("admin-token-user-4", "admin");
    const { cookie } = await createUser("owner-for-admin-token-4");
    const game = await createGameViaApi(cookie);

    const res = await bearerFetch(`/api/games/${game.id}`, TEST_ADMIN_TOKEN, {
      method: "PATCH",
      headers: { Origin: "https://evil.example.com" },
      body: JSON.stringify({ note: "Origin不一致でも通るはず" }),
    });

    expect(res.status).toBe(200);
  });
});
