import type { Member, Role, User } from "../../shared/types";

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
};

export function toUser(row: UserRow): User {
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
