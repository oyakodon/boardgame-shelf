import type { Context } from "hono";
import { createSession, deleteSession, upsertUserFromDiscordLogin } from "../db";
import type { Bindings } from "../env";
import {
  buildAuthorizeUrl,
  DiscordApiError,
  discordAvatarUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  isGuildMember,
} from "./discord";
import type { Variables } from "./middleware";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  generateSessionId,
  getOAuthStateCookie,
  getSessionId,
  hashSessionId,
  sessionExpiresAt,
  setOAuthStateCookie,
  setSessionCookie,
} from "./session";

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function redirectUri(c: AppContext): string {
  return new URL("/auth/callback", c.req.url).toString();
}

export async function login(c: AppContext) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  setOAuthStateCookie(c, { state, codeVerifier });

  const url = buildAuthorizeUrl({
    clientId: c.env.DISCORD_CLIENT_ID,
    redirectUri: redirectUri(c),
    state,
    codeChallenge,
  });
  return c.redirect(url);
}

export async function callback(c: AppContext) {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const saved = getOAuthStateCookie(c);
  clearOAuthStateCookie(c);

  if (!code || !state || !saved || saved.state !== state) {
    return c.json({ error: "invalid oauth state" }, 400);
  }

  let discordUser: Awaited<ReturnType<typeof fetchCurrentUser>>;
  try {
    const accessToken = await exchangeCodeForToken({
      clientId: c.env.DISCORD_CLIENT_ID,
      clientSecret: c.env.DISCORD_CLIENT_SECRET,
      redirectUri: redirectUri(c),
      code,
      codeVerifier: saved.codeVerifier,
    });

    const isMember = await isGuildMember(accessToken, c.env.DISCORD_GUILD_ID);
    if (!isMember) {
      return c.json({ error: "not a guild member" }, 403);
    }
    discordUser = await fetchCurrentUser(accessToken);
  } catch (err) {
    if (err instanceof DiscordApiError) {
      console.error(err);
      return c.redirect("/?error=login_failed");
    }
    throw err;
  }

  const adminIds = c.env.ADMIN_DISCORD_IDS.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const now = Math.floor(Date.now() / 1000);

  const user = await upsertUserFromDiscordLogin(
    c.env.DB,
    {
      id: discordUser.id,
      username: discordUser.username,
      displayName: discordUser.global_name ?? discordUser.username,
      avatarUrl: discordAvatarUrl(discordUser),
      initialRole: adminIds.includes(discordUser.id) ? "admin" : "member",
    },
    now,
  );

  const sessionId = generateSessionId();
  const idHash = await hashSessionId(sessionId);
  await createSession(c.env.DB, { idHash, userId: user.id, expiresAt: sessionExpiresAt(now) }, now);
  setSessionCookie(c, sessionId);

  return c.redirect("/");
}

export async function logout(c: AppContext) {
  const sessionId = getSessionId(c);
  if (sessionId) {
    await deleteSession(c.env.DB, await hashSessionId(sessionId));
  }
  clearSessionCookie(c);
  return c.body(null, 204);
}
