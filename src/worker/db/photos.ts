import type { GamePhoto } from "../../shared/types";
import { imgUrl } from "./games";

type GamePhotoRow = {
  id: string;
  r2_key: string;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: number;
};

const GAME_PHOTO_COLUMNS = "id, r2_key, width, height, sort_order, created_at";

function toGamePhoto(row: GamePhotoRow): GamePhoto {
  return {
    id: row.id,
    url: imgUrl(row.r2_key) as string,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function countPhotosByGameId(db: D1Database, gameId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM game_photos WHERE game_id = ?")
    .bind(gameId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listPhotosByGameId(db: D1Database, gameId: string): Promise<GamePhoto[]> {
  const { results } = await db
    .prepare(`SELECT ${GAME_PHOTO_COLUMNS} FROM game_photos WHERE game_id = ? ORDER BY sort_order ASC`)
    .bind(gameId)
    .all<GamePhotoRow>();
  return results.map(toGamePhoto);
}

export async function insertGamePhoto(
  db: D1Database,
  params: {
    id: string;
    gameId: string;
    r2Key: string;
    contentType: string;
    sizeBytes: number;
  },
  now: number,
): Promise<GamePhoto> {
  await db
    .prepare(
      `INSERT INTO game_photos (id, game_id, r2_key, content_type, size_bytes, width, height, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL,
         COALESCE((SELECT MAX(sort_order) FROM game_photos WHERE game_id = ?), -1) + 1,
         ?)`,
    )
    .bind(params.id, params.gameId, params.r2Key, params.contentType, params.sizeBytes, params.gameId, now)
    .run();

  const row = await db
    .prepare(`SELECT ${GAME_PHOTO_COLUMNS} FROM game_photos WHERE id = ?`)
    .bind(params.id)
    .first<GamePhotoRow>();
  if (!row) {
    throw new Error(`insert succeeded but photo ${params.id} not found`);
  }
  return toGamePhoto(row);
}

export async function getPhotoWithGameOwner(
  db: D1Database,
  photoId: string,
): Promise<{
  id: string;
  r2Key: string;
  gameId: string;
  gameOwnerId: string;
  gameRegisteredById: string | null;
} | null> {
  const row = await db
    .prepare(
      `SELECT p.id AS id, p.r2_key AS r2_key, p.game_id AS game_id,
              g.owner_id AS game_owner_id, g.registered_by_id AS game_registered_by_id
       FROM game_photos p
       JOIN games g ON g.id = p.game_id
       WHERE p.id = ?`,
    )
    .bind(photoId)
    .first<{
      id: string;
      r2_key: string;
      game_id: string;
      game_owner_id: string;
      game_registered_by_id: string | null;
    }>();
  return row
    ? {
        id: row.id,
        r2Key: row.r2_key,
        gameId: row.game_id,
        gameOwnerId: row.game_owner_id,
        gameRegisteredById: row.game_registered_by_id,
      }
    : null;
}

export async function deletePhotoById(db: D1Database, photoId: string): Promise<void> {
  await db.prepare("DELETE FROM game_photos WHERE id = ?").bind(photoId).run();
}
