import type { CreateGameRequest, Game, GamePhoto, Member, Role, Tag, UpdateGameRequest, User } from "../shared/types";

const TAG_SEPARATOR = "\u001f";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
  };
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT id, username, display_name, avatar_url, role FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
  return row ? toUser(row) : null;
}

export async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db
    .prepare("SELECT id, display_name FROM users ORDER BY display_name ASC")
    .all<{ id: string; display_name: string }>();
  return results.map((row) => ({ id: row.id, displayName: row.display_name }));
}

export async function userExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM users WHERE id = ?").bind(id).first<{ ok: number }>();
  return row !== null;
}

// roleは初回作成時のみ設定し、以後のログインでは上書きしない
// (管理者がD1を直接操作して昇格/降格するため)。display_nameはDiscord側の変更を反映するため毎回上書きする
export async function upsertUserFromDiscordLogin(
  db: D1Database,
  params: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    initialRole: Role;
  },
  now: number,
): Promise<User> {
  await db
    .prepare(
      `INSERT INTO users (id, username, display_name, avatar_url, role, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         updated_at = excluded.updated_at,
         last_login_at = excluded.last_login_at`,
    )
    .bind(params.id, params.username, params.displayName, params.avatarUrl, params.initialRole, now, now, now)
    .run();

  const user = await getUserById(db, params.id);
  if (!user) {
    throw new Error(`upsert succeeded but user ${params.id} not found`);
  }
  return user;
}

export async function createSession(
  db: D1Database,
  params: { idHash: string; userId: string; expiresAt: number },
  now: number,
): Promise<void> {
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(params.idHash, params.userId, params.expiresAt, now)
    .run();
}

export async function getSessionUser(
  db: D1Database,
  idHash: string,
  now: number,
): Promise<{ user: User; expiresAt: number } | null> {
  const row = await db
    .prepare(
      `SELECT users.id, users.username, users.display_name, users.avatar_url, users.role, sessions.expires_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(idHash, now)
    .first<UserRow & { expires_at: number }>();
  return row ? { user: toUser(row), expiresAt: row.expires_at } : null;
}

export async function extendSessionExpiry(db: D1Database, idHash: string, expiresAt: number): Promise<void> {
  await db.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").bind(expiresAt, idHash).run();
}

export async function deleteSession(db: D1Database, idHash: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
}

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
  g.play_time_min, g.play_time_max, g.note, g.bgg_id, g.status, g.created_at, g.updated_at,
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
         (id, owner_id, registered_by_id, title, min_players, max_players, play_time_min, play_time_max, note, bgg_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
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
  status: "status",
  ownerId: "owner_id",
};

export async function updateGame(
  db: D1Database,
  id: string,
  patch: UpdateGameRequest,
  now: number,
): Promise<Game | null> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<
    [keyof UpdateGameRequest, unknown]
  >;
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
