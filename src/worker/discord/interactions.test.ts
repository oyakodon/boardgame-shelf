import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Game } from "../../shared/types";
import type { Bindings } from "../env";
import { authedFetch, createUser, ORIGIN } from "../test-helpers";

const bindings = env as unknown as Bindings;
const TEST_GUILD_ID = "test-guild-id";

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateKeyPair() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  return { privateKey: pair.privateKey, publicKeyHex: bytesToHex(publicKey) };
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return bytesToHex(signature);
}

async function postInteraction(privateKey: CryptoKey, payload: unknown, overrides: Record<string, string> = {}) {
  const timestamp = "1700000000";
  const body = JSON.stringify(payload);
  const signature = await sign(privateKey, timestamp, body);

  return SELF.fetch(`${ORIGIN}/discord/interactions`, {
    method: "POST",
    body,
    headers: {
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": timestamp,
      ...overrides,
    },
  });
}

beforeEach(() => {
  bindings.DISCORD_GUILD_ID = TEST_GUILD_ID;
});

afterEach(() => {
  bindings.DISCORD_PUBLIC_KEY = "";
  bindings.DISCORD_GUILD_ID = "";
});

async function createGameForRecommend(
  minPlayers: number,
  maxPlayers: number,
  overrides: { title: string; bgaSlug?: string },
): Promise<Game> {
  const ownerId = `discord-owner-${crypto.randomUUID()}`;
  const { cookie } = await createUser(ownerId);
  const res = await authedFetch("/api/games", cookie, {
    method: "POST",
    body: JSON.stringify({
      title: overrides.title,
      minPlayers,
      maxPlayers,
      bgaSlug: overrides.bgaSlug ?? null,
    }),
  });
  return (await res.json()) as Game;
}

describe("POST /discord/interactions", () => {
  it("responds to PING with PONG", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;

    const res = await postInteraction(privateKey, { type: 1 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: 1 });
  });

  it("returns 401 when the signature does not match the configured public key", async () => {
    const { privateKey } = await generateKeyPair();
    const { publicKeyHex: otherPublicKey } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = otherPublicKey;

    const res = await postInteraction(privateKey, { type: 1 });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the signature headers are missing", async () => {
    const { publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;

    const res = await SELF.fetch(`${ORIGIN}/discord/interactions`, {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when an application command has no guild_id", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;

    const res = await postInteraction(privateKey, {
      type: 2,
      data: { name: "shelf" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 403 when an application command comes from another guild", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;

    const res = await postInteraction(privateKey, {
      type: 2,
      guild_id: "another-guild-id",
      data: { name: "shelf" },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("recommends the single game matching the requested player count as an embed", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;
    const game = await createGameForRecommend(201, 201, { title: "インタラクションテスト201" });

    const res = await postInteraction(privateKey, {
      type: 2,
      guild_id: TEST_GUILD_ID,
      data: { name: "shelf", options: [{ name: "players", value: 201 }] },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: number;
      data: {
        embeds: Array<{
          title: string;
          url: string;
          description: string;
          fields: Array<{ name: string; value: string; inline?: boolean }>;
          footer?: unknown;
        }>;
      };
    };
    expect(body.type).toBe(4);
    const [embed] = body.data.embeds;
    expect(embed.title).toBe("インタラクションテスト201");
    expect(embed.url).toBe(`${ORIGIN}/games/${game.id}`);
    expect(embed.description).toBe("🎲 201〜201人");
    expect(embed.fields).toEqual([
      { name: "👤 所有者", value: expect.stringContaining("discord-owner-"), inline: true },
    ]);
    expect(embed.footer).toBeUndefined();
  });

  it("responds with a not-found message when nothing matches", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;

    const res = await postInteraction(privateKey, {
      type: 2,
      guild_id: TEST_GUILD_ID,
      data: { name: "shelf", options: [{ name: "players", value: 9998 }] },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { content: string } };
    expect(body.data.content).toBe("🔍 条件に合うゲームが見つかりませんでした。");
  });

  it("filters to the game with a bga_slug when mode is online", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    bindings.DISCORD_PUBLIC_KEY = publicKeyHex;
    await createGameForRecommend(202, 202, { title: "オンライン対象202", bgaSlug: "some-slug-202" });
    await createGameForRecommend(202, 202, { title: "リアル専用202" });

    const res = await postInteraction(privateKey, {
      type: 2,
      guild_id: TEST_GUILD_ID,
      data: {
        name: "shelf",
        options: [
          { name: "players", value: 202 },
          { name: "mode", value: "online" },
        ],
      },
    });

    const body = (await res.json()) as {
      data: {
        embeds: Array<{
          title: string;
          fields: Array<{ name: string; value: string; inline?: boolean }>;
        }>;
      };
    };
    const [embed] = body.data.embeds;
    expect(embed.title).toBe("オンライン対象202");
    expect(embed.fields).toContainEqual({
      name: "🎮 BGA",
      value: "[プレイ](https://boardgamearena.com/gamepanel?game=some-slug-202)",
      inline: true,
    });
  });
});
