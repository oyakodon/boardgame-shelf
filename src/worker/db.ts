import type { Role, User } from "../shared/types";

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
