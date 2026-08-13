import type { Tag } from "../../shared/types";

type TagRow = { id: string; name: string };

function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name };
}

export async function listAllTags(db: D1Database): Promise<Tag[]> {
  const { results } = await db.prepare("SELECT id, name FROM tags ORDER BY name ASC").all<TagRow>();
  return results.map(toTag);
}

export async function listTagsForGame(db: D1Database, gameId: string): Promise<Tag[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id AS id, t.name AS name FROM game_tags gt
       JOIN tags t ON t.id = gt.tag_id
       WHERE gt.game_id = ?
       ORDER BY t.name ASC`,
    )
    .bind(gameId)
    .all<TagRow>();
  return results.map(toTag);
}

export async function findOrCreateTagByName(db: D1Database, name: string, now: number): Promise<Tag> {
  await db
    .prepare("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING")
    .bind(crypto.randomUUID(), name, now)
    .run();

  const row = await db.prepare("SELECT id, name FROM tags WHERE name = ?").bind(name).first<TagRow>();
  if (!row) {
    throw new Error(`upsert succeeded but tag ${name} not found`);
  }
  return toTag(row);
}

export async function attachTagToGame(db: D1Database, gameId: string, tagId: string): Promise<void> {
  await db
    .prepare("INSERT INTO game_tags (game_id, tag_id) VALUES (?, ?) ON CONFLICT(game_id, tag_id) DO NOTHING")
    .bind(gameId, tagId)
    .run();
}

export async function detachTagFromGame(db: D1Database, gameId: string, tagId: string): Promise<void> {
  await db.prepare("DELETE FROM game_tags WHERE game_id = ? AND tag_id = ?").bind(gameId, tagId).run();
}
