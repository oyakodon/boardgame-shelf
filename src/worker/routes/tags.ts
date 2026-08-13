import { findGameOrNull } from "../authz";
import type { AppContext } from "../context";
import { attachTagToGame, detachTagFromGame, findOrCreateTagByName, listAllTags, listTagsForGame } from "../db";

const MAX_TAG_NAME_LENGTH = 30;
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を弾くために意図的に使用する
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

function parseTagName(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const name = (body as Record<string, unknown>).name;
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TAG_NAME_LENGTH || CONTROL_CHARS.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export async function listTags(c: AppContext) {
  const tags = await listAllTags(c.env.DB);
  return c.json(tags);
}

export async function addTagToGame(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const name = parseTagName(body);
  if (!name) {
    return c.json({ error: "invalid request body" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const tag = await findOrCreateTagByName(c.env.DB, name, now);
  await attachTagToGame(c.env.DB, game.id, tag.id);

  const tags = await listTagsForGame(c.env.DB, game.id);
  return c.json(tags);
}

export async function removeTagFromGame(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }

  const tagId = c.req.param("tagId");
  if (!tagId) {
    return c.json({ error: "not found" }, 404);
  }

  await detachTagFromGame(c.env.DB, game.id, tagId);
  return c.body(null, 204);
}
