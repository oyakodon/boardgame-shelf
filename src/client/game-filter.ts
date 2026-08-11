import type { Game } from "../shared/types";

export type GameFilterCriteria = {
  players: number | null;
  keyword: string;
  ownerId: string | null;
  tags: string[];
};

export const EMPTY_FILTER: GameFilterCriteria = {
  players: null,
  keyword: "",
  ownerId: null,
  tags: [],
};

export function filterGames(games: Game[], criteria: GameFilterCriteria): Game[] {
  const keyword = criteria.keyword.trim().toLowerCase();

  return games.filter((game) => {
    if (criteria.players !== null) {
      if (game.minPlayers > criteria.players) {
        return false;
      }
      if (game.maxPlayers !== null && game.maxPlayers < criteria.players) {
        return false;
      }
    }

    if (criteria.ownerId !== null && game.ownerId !== criteria.ownerId) {
      return false;
    }

    if (criteria.tags.length > 0 && !criteria.tags.every((tag) => game.tagNames.includes(tag))) {
      return false;
    }

    if (keyword) {
      const haystack = `${game.title}\n${game.note ?? ""}`.toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    return true;
  });
}
