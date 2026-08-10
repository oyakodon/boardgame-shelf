import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Game } from "../../shared/types";
import { listGames } from "../api";
import { playersLabel } from "../game-format";

export function GameListPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGames()
      .then(setGames)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "一覧の取得に失敗しました"));
  }, []);

  return (
    <main className="mx-auto max-w-4xl p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-gray-900">ゲーム一覧</h1>

      {error && <p className="text-red-600">{error}</p>}
      {!error && !games && <p className="text-gray-600">読み込み中...</p>}
      {games && games.length === 0 && <p className="text-gray-600">まだゲームが登録されていません。</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {games?.map((game) => (
          <li key={game.id}>
            <Link
              to={`/games/${game.id}`}
              className="block overflow-hidden rounded-lg border border-gray-200 bg-white active:border-indigo-400"
            >
              <div className="aspect-square w-full bg-gray-100">
                {game.thumbnailUrl ? (
                  <img src={game.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <span className="text-3xl">🎲</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate font-semibold text-gray-900">{game.title}</p>
                <p className="text-sm text-gray-600">{playersLabel(game)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        to="/games/new"
        aria-label="ゲームを登録"
        className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg active:bg-indigo-700"
      >
        +
      </Link>
    </main>
  );
}
