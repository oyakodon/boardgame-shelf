import type { CreateGameRequest, Game, UpdateGameRequest } from "../../shared/types";

const TAG_SEPARATOR = "\u001f";

type GameRow = {
  id: string;
  owner_id: string;
  owner_name: string;
  registered_by_id: string | null;
  registered_by_name: string | null;
  title: string;
  min_players: number;
  max_players: number | null;
  play_time_min: number | null;
  play_time_max: number | null;
  note: string | null;
  bgg_id: number | null;
  bga_slug: string | null;
  status: Game["status"];
  created_at: number;
  updated_at: number;
  thumbnail_key: string | null;
  tag_names_concat: string | null;
};

const GAME_COLUMNS_WITH_THUMBNAIL = `
  g.id, g.owner_id, COALESCE(u.display_name, '(不明なユーザー)') AS owner_name,
  g.registered_by_id, r.display_name AS registered_by_name,
  g.title, g.min_players, g.max_players,
  g.play_time_min, g.play_time_max, g.note, g.bgg_id, g.bga_slug, g.status, g.created_at, g.updated_at,
  p.r2_key AS thumbnail_key,
  (
    SELECT GROUP_CONCAT(name, char(31)) FROM (
      SELECT t.name AS name FROM game_tags gt
      JOIN tags t ON t.id = gt.tag_id
      WHERE gt.game_id = g.id
      ORDER BY t.name ASC
    )
  ) AS tag_names_concat
`;

const OWNER_JOIN = `
  LEFT JOIN users u ON u.id = g.owner_id
  LEFT JOIN users r ON r.id = g.registered_by_id
`;

const THUMBNAIL_JOIN = `
  LEFT JOIN game_photos p
    ON p.id = (
      SELECT id FROM game_photos WHERE game_id = g.id ORDER BY sort_order ASC, id ASC LIMIT 1
    )
`;

export function imgUrl(r2Key: string | null): string | null {
  return r2Key ? `/img/${r2Key}` : null;
}

function parseTagNames(concat: string | null): string[] {
  return concat ? concat.split(TAG_SEPARATOR) : [];
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    registeredById: row.registered_by_id,
    registeredByName: row.registered_by_name,
    title: row.title,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    playTimeMin: row.play_time_min,
    playTimeMax: row.play_time_max,
    note: row.note,
    bggId: row.bgg_id,
    bgaSlug: row.bga_slug,
    status: row.status,
    thumbnailUrl: imgUrl(row.thumbnail_key),
    tagNames: parseTagNames(row.tag_names_concat),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertGame(
  db: D1Database,
  params: { id: string; ownerId: string; registeredById: string } & CreateGameRequest,
  now: number,
): Promise<Game> {
  await db
    .prepare(
      `INSERT INTO games
         (id, owner_id, registered_by_id, title, min_players, max_players, play_time_min, play_time_max, note, bgg_id, bga_slug, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
    )
    .bind(
      params.id,
      params.ownerId,
      params.registeredById,
      params.title,
      params.minPlayers,
      params.maxPlayers ?? null,
      params.playTimeMin ?? null,
      params.playTimeMax ?? null,
      params.note ?? null,
      params.bggId ?? null,
      params.bgaSlug ?? null,
      now,
      now,
    )
    .run();

  const game = await getGameById(db, params.id);
  if (!game) {
    throw new Error(`insert succeeded but game ${params.id} not found`);
  }
  return game;
}

export async function listActiveGames(db: D1Database): Promise<Game[]> {
  const { results } = await db
    .prepare(
      `SELECT ${GAME_COLUMNS_WITH_THUMBNAIL} FROM games g ${OWNER_JOIN} ${THUMBNAIL_JOIN}
       WHERE g.deleted_at IS NULL ORDER BY g.created_at DESC`,
    )
    .all<GameRow>();
  return results.map(toGame);
}

export async function getGameById(db: D1Database, id: string): Promise<Game | null> {
  const row = await db
    .prepare(
      `SELECT ${GAME_COLUMNS_WITH_THUMBNAIL} FROM games g ${OWNER_JOIN} ${THUMBNAIL_JOIN}
       WHERE g.id = ? AND g.deleted_at IS NULL`,
    )
    .bind(id)
    .first<GameRow>();
  return row ? toGame(row) : null;
}

const UPDATABLE_GAME_COLUMNS: Record<keyof UpdateGameRequest, string> = {
  title: "title",
  minPlayers: "min_players",
  maxPlayers: "max_players",
  playTimeMin: "play_time_min",
  playTimeMax: "play_time_max",
  note: "note",
  bggId: "bgg_id",
  bgaSlug: "bga_slug",
  status: "status",
  ownerId: "owner_id",
};

export async function updateGame(
  db: D1Database,
  id: string,
  patch: UpdateGameRequest,
  now: number,
): Promise<Game | null> {
  const entries = Object.entries(patch).filter(
    ([key, value]) => value !== undefined && Object.hasOwn(UPDATABLE_GAME_COLUMNS, key),
  ) as Array<[keyof UpdateGameRequest, unknown]>;
  const setClauses = entries.map(([key]) => `${UPDATABLE_GAME_COLUMNS[key]} = ?`);
  const values = entries.map(([, value]) => value);

  await db
    .prepare(`UPDATE games SET ${[...setClauses, "updated_at = ?"].join(", ")} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...values, now, id)
    .run();

  return getGameById(db, id);
}

export async function softDeleteGame(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE games SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(now, now, id)
    .run();
}
