import { describe, expect, it } from "vitest";
import { playersLabel, playTimeLabel } from "./game-format";

describe("playersLabel", () => {
  it("shows a range when min and max differ", () => {
    expect(playersLabel({ minPlayers: 2, maxPlayers: 4 })).toBe("2〜4人");
  });

  it("shows a single number when min equals max", () => {
    expect(playersLabel({ minPlayers: 3, maxPlayers: 3 })).toBe("3人");
  });

  it("shows an open-ended label when maxPlayers is null", () => {
    expect(playersLabel({ minPlayers: 2, maxPlayers: null })).toBe("2人〜");
  });
});

describe("playTimeLabel", () => {
  it("returns null when both min and max are null", () => {
    expect(playTimeLabel({ playTimeMin: null, playTimeMax: null })).toBeNull();
  });

  it("shows only the min value when max is null", () => {
    expect(playTimeLabel({ playTimeMin: 30, playTimeMax: null })).toBe("30分");
  });

  it("shows only the max value when min is null", () => {
    expect(playTimeLabel({ playTimeMin: null, playTimeMax: 60 })).toBe("60分");
  });

  it("shows a single value when min equals max", () => {
    expect(playTimeLabel({ playTimeMin: 45, playTimeMax: 45 })).toBe("45分");
  });

  it("shows a range when min and max differ", () => {
    expect(playTimeLabel({ playTimeMin: 30, playTimeMax: 60 })).toBe("30〜60分");
  });
});
