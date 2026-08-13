import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const EXTEND_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

const OAUTH_STATE_COOKIE_NAME = "oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export type OAuthState = {
  state: string;
  codeVerifier: string;
};

// __Host-プレフィックスはSecure必須のため、httpのwrangler devでは保存できない。
// そのためhttps以外ではプレフィックス無しのCookieにフォールバックする。
function isSecureRequest(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashSessionId(id: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionExpiresAt(now: number): number {
  return now + SESSION_TTL_SECONDS;
}

export function shouldExtendSession(expiresAt: number, now: number): boolean {
  return expiresAt - now < EXTEND_THRESHOLD_SECONDS;
}

export function setSessionCookie(c: Context, sessionId: string): void {
  const secure = isSecureRequest(c);
  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    ...(secure ? { prefix: "host" } : { path: "/" }),
  });
}

export function getSessionId(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME, isSecureRequest(c) ? "host" : undefined);
}

export function clearSessionCookie(c: Context): void {
  const secure = isSecureRequest(c);
  deleteCookie(c, COOKIE_NAME, secure ? { prefix: "host" } : { path: "/" });
}

export function setOAuthStateCookie(c: Context, value: OAuthState): void {
  const secure = isSecureRequest(c);
  setCookie(c, OAUTH_STATE_COOKIE_NAME, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    ...(secure ? { prefix: "host" } : { path: "/" }),
  });
}

export function getOAuthStateCookie(c: Context): OAuthState | undefined {
  const raw = getCookie(c, OAUTH_STATE_COOKIE_NAME, isSecureRequest(c) ? "host" : undefined);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.state === "string" && typeof parsed.codeVerifier === "string") {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function clearOAuthStateCookie(c: Context): void {
  const secure = isSecureRequest(c);
  deleteCookie(c, OAUTH_STATE_COOKIE_NAME, secure ? { prefix: "host" } : { path: "/" });
}
