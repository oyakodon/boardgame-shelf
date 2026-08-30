// Discord Interactionsのリクエストは、公開鍵に対するEd25519署名で本物であることを保証する。
// https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization

function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("invalid hexadecimal input");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordRequest(params: {
  publicKey: string;
  signature: string;
  timestamp: string;
  body: string;
}): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(params.publicKey), { name: "Ed25519" }, false, [
      "verify",
    ]);
    const message = new TextEncoder().encode(params.timestamp + params.body);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(params.signature), message);
  } catch {
    return false;
  }
}
