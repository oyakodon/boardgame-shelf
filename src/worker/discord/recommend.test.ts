import { describe, expect, it } from "vitest";
import type { Game } from "../../shared/types";
import { filterRecommendableGames, pickRandomGame } from "./recommend";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: crypto.randomUUID(),
    ownerId: "owner-1",
    ownerName: "owner",
    registeredById: "owner-1",
    registeredByName: "owner",
    title: "テストゲーム",
    minPlayers: 2,
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

describe("filterRecommendableGames", () => {
  it("excludes retired games", () => {
    const games = [makeGame({ status: "retired" })];

    expect(filterRecommendableGames(games, {})).toEqual([]);
  });

  it("filters by player count using the min/max range", () => {
    const inRange = makeGame({ minPlayers: 2, maxPlayers: 4 });
    const tooFew = makeGame({ minPlayers: 5, maxPlayers: 6 });
    const noUpperLimit = makeGame({ minPlayers: 1, maxPlayers: null });

    const result = filterRecommendableGames([inRange, tooFew, noUpperLimit], { players: 3 });

    expect(result).toEqual([inRange, noUpperLimit]);
  });

  it("does not filter by player count when unspecified", () => {
    const games = [makeGame({ minPlayers: 5, maxPlayers: 6 }), makeGame({ minPlayers: 1, maxPlayers: 2 })];

    expect(filterRecommendableGames(games, {})).toEqual(games);
  });

  it("restricts to games with a bga_slug when mode is online", () => {
    const online = makeGame({ bgaSlug: "race-for-the-galaxy" });
    const offlineOnly = makeGame({ bgaSlug: null });

    const result = filterRecommendableGames([online, offlineOnly], { mode: "online" });

    expect(result).toEqual([online]);
  });

  it("does not restrict by bga_slug when mode is real", () => {
    const games = [makeGame({ bgaSlug: "some-slug" }), makeGame({ bgaSlug: null })];

    expect(filterRecommendableGames(games, { mode: "real" })).toEqual(games);
  });

  it("does not restrict by bga_slug when mode is unspecified", () => {
    const games = [makeGame({ bgaSlug: "some-slug" }), makeGame({ bgaSlug: null })];

    expect(filterRecommendableGames(games, {})).toEqual(games);
  });

  it("combines player count and mode filters", () => {
    const match = makeGame({ minPlayers: 2, maxPlayers: 4, bgaSlug: "slug" });
    const wrongPlayers = makeGame({ minPlayers: 5, maxPlayers: 6, bgaSlug: "slug" });
    const notOnline = makeGame({ minPlayers: 2, maxPlayers: 4, bgaSlug: null });

    const result = filterRecommendableGames([match, wrongPlayers, notOnline], { players: 3, mode: "online" });

    expect(result).toEqual([match]);
  });
});

describe("pickRandomGame", () => {
  it("returns null for an empty list", () => {
    expect(pickRandomGame([])).toBeNull();
  });

  it("returns the only game when there is exactly one candidate", () => {
    const game = makeGame();

    expect(pickRandomGame([game])).toEqual(game);
  });

  it("only ever returns a game from the candidate list", () => {
    const games = [makeGame(), makeGame(), makeGame()];

    for (let i = 0; i < 20; i++) {
      expect(games).toContainEqual(pickRandomGame(games));
    }
  });
});
