import { describe, expect, it } from "vitest";
import { bgaUrl, extractBgaSlug } from "./bga";

describe("extractBgaSlug", () => {
  it("returns the slug as-is for a plain slug input", () => {
    expect(extractBgaSlug("raceforthegalaxy")).toBe("raceforthegalaxy");
  });

  it("extracts the slug from a gamepanel URL", () => {
    expect(extractBgaSlug("https://boardgamearena.com/gamepanel?game=raceforthegalaxy")).toBe("raceforthegalaxy");
  });

  it("extracts the slug ignoring other query parameters", () => {
    expect(extractBgaSlug("https://boardgamearena.com/gamepanel?table=123&game=reefgardens&lang=ja")).toBe(
      "reefgardens",
    );
  });

  it("returns null for a non-BGA URL", () => {
    expect(extractBgaSlug("https://example.com/gamepanel?game=raceforthegalaxy")).toBeNull();
  });

  it("returns null for a BGA URL without a game parameter", () => {
    expect(extractBgaSlug("https://boardgamearena.com/gamepanel")).toBeNull();
  });

  it("returns null for a slug containing invalid characters", () => {
    expect(extractBgaSlug("Race For The Galaxy!")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractBgaSlug("")).toBeNull();
    expect(extractBgaSlug("   ")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(extractBgaSlug("  raceforthegalaxy  ")).toBe("raceforthegalaxy");
  });

  it("returns null for a slug longer than 64 characters", () => {
    expect(extractBgaSlug("a".repeat(65))).toBeNull();
  });
});

describe("bgaUrl", () => {
  it("builds the gamepanel URL for a slug", () => {
    expect(bgaUrl("raceforthegalaxy")).toBe("https://boardgamearena.com/gamepanel?game=raceforthegalaxy");
  });
});
