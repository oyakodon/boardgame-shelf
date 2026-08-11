import { describe, expect, it } from "vitest";
import { extractBggId } from "./bgg";

describe("extractBggId", () => {
  it("returns the number as-is for a plain numeric input", () => {
    expect(extractBggId("13")).toBe(13);
  });

  it("extracts the id from a boardgame URL with a title slug", () => {
    expect(extractBggId("https://boardgamegeek.com/boardgame/13/catan")).toBe(13);
  });

  it("extracts the id from a boardgame URL without a title slug", () => {
    expect(extractBggId("https://www.boardgamegeek.com/boardgame/13")).toBe(13);
  });

  it("extracts the id ignoring query parameters", () => {
    expect(extractBggId("https://boardgamegeek.com/boardgame/13/catan?tab=info")).toBe(13);
  });

  it("extracts the id from a boardgameexpansion URL", () => {
    expect(extractBggId("https://boardgamegeek.com/boardgameexpansion/12345/some-expansion")).toBe(12345);
  });

  it("returns null for a non-BGG URL", () => {
    expect(extractBggId("https://example.com/boardgame/13")).toBeNull();
  });

  it("returns null for a BGG URL without a game path", () => {
    expect(extractBggId("https://boardgamegeek.com/forum/123")).toBeNull();
  });

  it("returns null for garbage text", () => {
    expect(extractBggId("not a url or a number")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractBggId("")).toBeNull();
    expect(extractBggId("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(extractBggId("  13  ")).toBe(13);
    expect(extractBggId("  https://boardgamegeek.com/boardgame/13/catan  ")).toBe(13);
  });

  it("returns null for zero", () => {
    expect(extractBggId("0")).toBeNull();
    expect(extractBggId("https://boardgamegeek.com/boardgame/0/nothing")).toBeNull();
  });

  it("returns null for a numeric input that exceeds Number.MAX_SAFE_INTEGER", () => {
    const tooLarge = `${Number.MAX_SAFE_INTEGER}0`;
    expect(extractBggId(tooLarge)).toBeNull();
    expect(extractBggId(`https://boardgamegeek.com/boardgame/${tooLarge}/huge`)).toBeNull();
  });
});
