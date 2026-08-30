import type { Game } from "../../shared/types";

export type RecommendMode = "online" | "real";

export type RecommendFilter = {
  players?: number;
  mode?: RecommendMode;
};

function matchesPlayers(game: Game, players: number | undefined): boolean {
  if (players === undefined) {
    return true;
  }
  return game.minPlayers <= players && (game.maxPlayers === null || game.maxPlayers >= players);
}

// online: BGA(bga_slug)で遊べるゲームに絞る。real: 絞り込みなし(全ゲームが対象)。
function matchesMode(game: Game, mode: RecommendMode | undefined): boolean {
  if (mode === "online") {
    return game.bgaSlug !== null;
  }
  return true;
}

export function filterRecommendableGames(games: Game[], filter: RecommendFilter): Game[] {
  return games.filter(
    (game) => game.status === "available" && matchesPlayers(game, filter.players) && matchesMode(game, filter.mode),
  );
}

export function pickRandomGame(games: Game[]): Game | null {
  if (games.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * games.length);
  return games[index];
}
