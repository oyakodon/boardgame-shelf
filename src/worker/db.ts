import type { CreateGameRequest, Game, Role, UpdateGameRequest, User } from "../shared/types";

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

// display_nameとroleは初回作成時のみ設定し、以後のログインでは上書きしない
// (display_nameはユーザーが変更できる、roleは管理者がD1を直接操作して昇格/降格するため)
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
};

const GAME_COLUMNS =
  "id, owner_id, title, min_players, max_players, play_time_min, play_time_max, note, bgg_id, status, created_at, updated_at";

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    playTimeMin: row.play_time_min,
    playTimeMax: row.play_time_max,
    note: row.note,
    bggId: row.bgg_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertGame(
  db: D1Database,
  params: { id: string; ownerId: string } & CreateGameRequest,
  now: number,
): Promise<Game> {
  await db
    .prepare(
      `INSERT INTO games
         (id, owner_id, title, min_players, max_players, play_time_min, play_time_max, note, bgg_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)`,
    )
    .bind(
      params.id,
      params.ownerId,
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
    .prepare(`SELECT ${GAME_COLUMNS} FROM games WHERE deleted_at IS NULL ORDER BY created_at DESC`)
    .all<GameRow>();
  return results.map(toGame);
}

export async function getGameById(db: D1Database, id: string): Promise<Game | null> {
  const row = await db
    .prepare(`SELECT ${GAME_COLUMNS} FROM games WHERE id = ? AND deleted_at IS NULL`)
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
