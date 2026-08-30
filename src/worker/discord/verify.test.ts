import { describe, expect, it } from "vitest";
import { verifyDiscordRequest } from "./verify";

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateKeyPair() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  return { privateKey: pair.privateKey, publicKeyHex: bytesToHex(publicKey) };
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return bytesToHex(signature);
}

describe("verifyDiscordRequest", () => {
  it("accepts a request signed with the matching private key", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const signature = await sign(privateKey, timestamp, body);

    const ok = await verifyDiscordRequest({ publicKey: publicKeyHex, signature, timestamp, body });

    expect(ok).toBe(true);
  });

  it("rejects a request signed with a different key", async () => {
    const { publicKeyHex } = await generateKeyPair();
    const { privateKey: otherPrivateKey } = await generateKeyPair();
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const signature = await sign(otherPrivateKey, timestamp, body);

    const ok = await verifyDiscordRequest({ publicKey: publicKeyHex, signature, timestamp, body });

    expect(ok).toBe(false);
  });

  it("rejects a request whose body was tampered with after signing", async () => {
    const { privateKey, publicKeyHex } = await generateKeyPair();
    const timestamp = "1700000000";
    const signature = await sign(privateKey, timestamp, JSON.stringify({ type: 1 }));

    const ok = await verifyDiscordRequest({
      publicKey: publicKeyHex,
      signature,
      timestamp,
      body: JSON.stringify({ type: 2 }),
    });

    expect(ok).toBe(false);
  });

  it("rejects malformed signature/public key input instead of throwing", async () => {
    const ok = await verifyDiscordRequest({
      publicKey: "not-hex",
      signature: "also-not-hex",
      timestamp: "1700000000",
      body: "{}",
    });

    expect(ok).toBe(false);
  });
});
