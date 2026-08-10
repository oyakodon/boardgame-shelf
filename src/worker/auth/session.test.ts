import { describe, expect, it } from "vitest";
import { generateSessionId, hashSessionId, sessionExpiresAt, shouldExtendSession } from "./session";

describe("generateSessionId", () => {
  it("generates a base64url string with no padding", () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates different values each call", () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});

describe("hashSessionId", () => {
  it("returns the SHA-256 hex digest of the input", async () => {
    // echo -n "test-session-id" | sha256sum
    expect(await hashSessionId("test-session-id")).toBe(
      "08001f8fa6f5dbb9a20ddf1e8366af93a76815f84035cfd2e93233475c968279",
    );
  });

  it("is deterministic for the same input", async () => {
    const id = generateSessionId();
    expect(await hashSessionId(id)).toBe(await hashSessionId(id));
  });

  it("differs for different inputs", async () => {
    expect(await hashSessionId("a")).not.toBe(await hashSessionId("b"));
  });
});

describe("sessionExpiresAt", () => {
  it("adds 30 days in seconds to now", () => {
    const now = 1_000_000;
    expect(sessionExpiresAt(now)).toBe(now + 30 * 24 * 60 * 60);
  });
});

describe("shouldExtendSession", () => {
  const now = 1_000_000;

  it("returns true when less than 7 days remain", () => {
    const expiresAt = now + 6 * 24 * 60 * 60;
    expect(shouldExtendSession(expiresAt, now)).toBe(true);
  });

  it("returns false when 7 days or more remain", () => {
    const expiresAt = now + 7 * 24 * 60 * 60;
    expect(shouldExtendSession(expiresAt, now)).toBe(false);
  });
});
