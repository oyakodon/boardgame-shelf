import type { User } from "../../shared/types";
import { toUser, type UserRow } from "./users";

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
