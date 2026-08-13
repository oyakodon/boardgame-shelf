import type { Context, Next } from "hono";
import type { User } from "../../shared/types";
import { extendSessionExpiry, getSessionUser, getUserById } from "../db";
import type { Bindings } from "../env";
import { getSessionId, hashSessionId, sessionExpiresAt, setSessionCookie, shouldExtendSession } from "./session";

export type AuthMethod = "session" | "adminToken";

export type Variables = {
  user: User;
  authMethod: AuthMethod;
};

type AuthContext = Context<{ Bindings: Bindings; Variables: Variables }>;

// セッションCookie、またはAuthorization: Bearer <ADMIN_API_TOKEN>のいずれかで認証する。
export async function requireAuth(c: AuthContext, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (authHeader) {
    return authenticateWithAdminToken(c, authHeader, next);
  }
  return authenticateWithSession(c, next);
}

async function authenticateWithAdminToken(c: AuthContext, authHeader: string, next: Next) {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token || token !== c.env.ADMIN_API_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const adminId = c.env.ADMIN_DISCORD_IDS.split(",")[0]?.trim();
  const user = adminId ? await getUserById(c.env.DB, adminId) : null;
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  c.set("authMethod", "adminToken");
  return next();
}

async function authenticateWithSession(c: AuthContext, next: Next) {
  const sessionId = getSessionId(c);
  if (!sessionId) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const idHash = await hashSessionId(sessionId);
  const now = Math.floor(Date.now() / 1000);
  const session = await getSessionUser(c.env.DB, idHash, now);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (shouldExtendSession(session.expiresAt, now)) {
    const newExpiresAt = sessionExpiresAt(now);
    await extendSessionExpiry(c.env.DB, idHash, newExpiresAt);
    setSessionCookie(c, sessionId);
  }
  c.set("user", session.user);
  c.set("authMethod", "session");
  return next();
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

// 更新系(POST/PATCH/DELETE)でOriginヘッダの一致を要求する。
// Bearerトークン認証はCookieを使わずCSRFの対象にならないため対象外。
export function requireSameOrigin(c: AuthContext, next: Next) {
  if (!MUTATING_METHODS.has(c.req.method) || c.get("authMethod") === "adminToken") {
    return next();
  }
  const origin = c.req.header("Origin");
  if (origin !== new URL(c.req.url).origin) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
}
