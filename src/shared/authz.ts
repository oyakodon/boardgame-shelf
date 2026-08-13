import type { Game, User } from "./types";

// 所有者だけでなく登録者も編集できる。他人の持ち物を代理登録した人が、
// 自分の入力ミスをadmin待ちにならず直せるようにするため。
export function canEditGame(game: Pick<Game, "ownerId" | "registeredById">, user: User | null): boolean {
  return user !== null && (game.ownerId === user.id || game.registeredById === user.id || user.role === "admin");
}
