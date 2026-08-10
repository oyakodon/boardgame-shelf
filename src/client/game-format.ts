import type { Game } from "../shared/types";

export function playersLabel(game: Game): string {
  if (game.maxPlayers === null) {
    return `${game.minPlayers}人〜`;
  }
  return game.minPlayers === game.maxPlayers ? `${game.minPlayers}人` : `${game.minPlayers}〜${game.maxPlayers}人`;
}
