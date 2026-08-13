import type { Game } from "../shared/types";

export function playersLabel(game: Pick<Game, "minPlayers" | "maxPlayers">): string {
  if (game.maxPlayers === null) {
    return `${game.minPlayers}人〜`;
  }
  return game.minPlayers === game.maxPlayers ? `${game.minPlayers}人` : `${game.minPlayers}〜${game.maxPlayers}人`;
}

export function playTimeLabel(game: Pick<Game, "playTimeMin" | "playTimeMax">): string | null {
  if (game.playTimeMin === null && game.playTimeMax === null) {
    return null;
  }
  if (game.playTimeMin !== null && game.playTimeMax !== null && game.playTimeMin !== game.playTimeMax) {
    return `${game.playTimeMin}〜${game.playTimeMax}分`;
  }
  return `${game.playTimeMin ?? game.playTimeMax}分`;
}
