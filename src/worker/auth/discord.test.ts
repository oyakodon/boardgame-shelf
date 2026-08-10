import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  DiscordApiError,
  exchangeCodeForToken,
  fetchCurrentUser,
  generateCodeChallenge,
  isGuildMember,
} from "./discord";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("includes the PKCE and scope parameters", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "https://example.com/auth/callback",
        state: "state-value",
        codeChallenge: "challenge-value",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/auth/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("identify guilds.members.read");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("generateCodeChallenge", () => {
  it("returns the base64url S256 challenge for a verifier (RFC 7636 test vector)", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await generateCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("exchangeCodeForToken", () => {
  const params = {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "https://example.com/auth/callback",
    code: "code",
    codeVerifier: "verifier",
  };

  it("returns the access token on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "token-abc" }), { status: 200 })),
    );
    expect(await exchangeCodeForToken(params)).toBe("token-abc");
  });

  it("throws DiscordApiError on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    await expect(exchangeCodeForToken(params)).rejects.toThrow(DiscordApiError);
  });
});

describe("fetchCurrentUser", () => {
  it("returns the discord user on success", async () => {
    const user = { id: "1", username: "alice", global_name: "Alice", avatar: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(user), { status: 200 })));
    expect(await fetchCurrentUser("token")).toEqual(user);
  });

  it("throws DiscordApiError on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));
    await expect(fetchCurrentUser("token")).rejects.toThrow(DiscordApiError);
  });
});

describe("isGuildMember", () => {
  it("returns true when the member endpoint succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await isGuildMember("token", "guild-id")).toBe(true);
  });

  it("returns false on 404 (not a member)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    expect(await isGuildMember("token", "guild-id")).toBe(false);
  });

  it("throws DiscordApiError on other error statuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("server error", { status: 500 })));
    await expect(isGuildMember("token", "guild-id")).rejects.toThrow(DiscordApiError);
  });
});
