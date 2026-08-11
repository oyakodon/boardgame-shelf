import { describe, expect, it } from "vitest";
import type { Game } from "../shared/types";
import { EMPTY_FILTER, filterGames } from "./game-filter";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    ownerId: "owner-1",
    ownerName: "オーナー",
    registeredById: "owner-1",
    registeredByName: "オーナー",
    title: "カタン",
    minPlayers: 3,
    maxPlayers: 4,
    playTimeMin: null,
    playTimeMax: null,
    note: null,
    bggId: null,
    bgaSlug: null,
    status: "available",
    thumbnailUrl: null,
    tagNames: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("filterGames", () => {
  it("returns all games when no criteria is set", () => {
    const games = [makeGame(), makeGame({ id: "game-2" })];
    expect(filterGames(games, EMPTY_FILTER)).toHaveLength(2);
  });

  it("filters by players using min/max bounds", () => {
    const games = [makeGame({ minPlayers: 3, maxPlayers: 4 })];
    expect(filterGames(games, { ...EMPTY_FILTER, players: 2 })).toHaveLength(0);
    expect(filterGames(games, { ...EMPTY_FILTER, players: 3 })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, players: 4 })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, players: 5 })).toHaveLength(0);
  });

  it("treats maxPlayers === null as no upper limit", () => {
    const games = [makeGame({ minPlayers: 2, maxPlayers: null })];
    expect(filterGames(games, { ...EMPTY_FILTER, players: 8 })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, players: 1 })).toHaveLength(0);
  });

  it("filters by keyword matching title or note, case-insensitively", () => {
    const games = [
      makeGame({ id: "a", title: "カタン", note: null }),
      makeGame({ id: "b", title: "宝石の煌き", note: "Splendor" }),
    ];
    expect(filterGames(games, { ...EMPTY_FILTER, keyword: "カタン" })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, keyword: "splendor" })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, keyword: "存在しない" })).toHaveLength(0);
  });

  it("filters by owner", () => {
    const games = [makeGame({ ownerId: "owner-1" }), makeGame({ id: "game-2", ownerId: "owner-2" })];
    expect(filterGames(games, { ...EMPTY_FILTER, ownerId: "owner-2" })).toHaveLength(1);
  });

  it("filters by tags requiring all selected tags to match (AND)", () => {
    const games = [makeGame({ id: "a", tagNames: ["重ゲー", "協力"] }), makeGame({ id: "b", tagNames: ["重ゲー"] })];
    expect(filterGames(games, { ...EMPTY_FILTER, tags: ["重ゲー"] })).toHaveLength(2);
    expect(filterGames(games, { ...EMPTY_FILTER, tags: ["重ゲー", "協力"] })).toHaveLength(1);
    expect(filterGames(games, { ...EMPTY_FILTER, tags: ["軽ゲー"] })).toHaveLength(0);
  });

  it("combines multiple criteria", () => {
    const games = [
      makeGame({ id: "a", minPlayers: 2, maxPlayers: 4, ownerId: "owner-1", tagNames: ["重ゲー"], title: "カタン" }),
      makeGame({ id: "b", minPlayers: 2, maxPlayers: 4, ownerId: "owner-2", tagNames: ["重ゲー"], title: "カタン" }),
    ];
    const result = filterGames(games, { players: 3, keyword: "カタン", ownerId: "owner-1", tags: ["重ゲー"] });
    expect(result.map((g) => g.id)).toEqual(["a"]);
  });
});
