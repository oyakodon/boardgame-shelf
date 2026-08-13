import { env, SELF } from "cloudflare:test";
import { hashSessionId } from "./auth/session";
import type { Bindings } from "./env";

const db = (env as unknown as Bindings).DB;

export const ORIGIN = "https://example.com";

export async function createUser(id: string, role: "member" | "admin" = "member") {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO users (id, username, display_name, avatar_url, role, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, id, id, null, role, now, now, now)
    .run();

  const rawSessionId = `session-${id}`;
  const idHash = await hashSessionId(rawSessionId);
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(idHash, id, now + 1000, now)
    .run();

  return { cookie: `__Host-session=${rawSessionId}` };
}

export function authedFetch(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", cookie);
  if (init.method && init.method !== "GET") {
    headers.set("Origin", ORIGIN);
  }
  if (typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return SELF.fetch(`${ORIGIN}${path}`, { ...init, headers });
}
