import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Game } from "../../shared/types";
import { listGames } from "../api";
import { filterGames, type GameFilterCriteria } from "../game-filter";
import { playersLabel } from "../game-format";

const PLAYER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

function parseCriteria(params: URLSearchParams): GameFilterCriteria {
  const playersRaw = params.get("players");
  const players = playersRaw ? Number(playersRaw) : Number.NaN;
  return {
    players: Number.isInteger(players) && players > 0 ? players : null,
    keyword: params.get("q") ?? "",
    ownerId: params.get("owner"),
    tags: params.getAll("tag"),
  };
}

function chipClass(active: boolean): string {
  return `min-h-9 rounded-full border px-3 text-sm ${
    active ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 text-gray-700"
  }`;
}

export function GameListPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    listGames()
      .then(setGames)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "一覧の取得に失敗しました"));
  }, []);

  const criteria = useMemo(() => parseCriteria(searchParams), [searchParams]);

  const owners = useMemo(() => {
    if (!games) return [];
    const map = new Map<string, string>();
    for (const g of games) {
      map.set(g.ownerId, g.ownerName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [games]);

  const tags = useMemo(() => {
    if (!games) return [];
    return [...new Set(games.flatMap((g) => g.tagNames))].sort((a, b) => a.localeCompare(b, "ja"));
  }, [games]);

  const filtered = useMemo(() => (games ? filterGames(games, criteria) : []), [games, criteria]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  function togglePlayers(n: number) {
    updateParam("players", criteria.players === n ? null : String(n));
  }

  function toggleOwner(id: string) {
    updateParam("owner", criteria.ownerId === id ? null : id);
  }

  function toggleTag(name: string) {
    const next = new URLSearchParams(searchParams);
    const current = next.getAll("tag");
    next.delete("tag");
    const nextTags = current.includes(name) ? current.filter((t) => t !== name) : [...current, name];
    for (const t of nextTags) {
      next.append("tag", t);
    }
    setSearchParams(next, { replace: true });
  }

  const hasActiveFilter =
    criteria.players !== null || criteria.keyword !== "" || criteria.ownerId !== null || criteria.tags.length > 0;

  return (
    <main className="mx-auto max-w-4xl p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-gray-900">ゲーム一覧</h1>

      <div className="mb-4 space-y-3">
        <input
          type="search"
          value={criteria.keyword}
          onChange={(e) => updateParam("q", e.target.value || null)}
          placeholder="タイトル・コメントで検索"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap gap-2">
          {PLAYER_OPTIONS.map((n, i) => (
            <button
              key={n}
              type="button"
              onClick={() => togglePlayers(n)}
              aria-pressed={criteria.players === n}
              className={chipClass(criteria.players === n)}
            >
              {i === PLAYER_OPTIONS.length - 1 ? `${n}+` : n}
            </button>
          ))}
        </div>

        {owners.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {owners.map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleOwner(id)}
                aria-pressed={criteria.ownerId === id}
                className={chipClass(criteria.ownerId === id)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={criteria.tags.includes(tag)}
                className={chipClass(criteria.tags.includes(tag))}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            className="text-sm text-indigo-600 underline"
          >
            絞り込みを解除
          </button>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!error && !games && <p className="text-gray-600">読み込み中...</p>}
      {games && games.length === 0 && <p className="text-gray-600">まだゲームが登録されていません。</p>}
      {games && games.length > 0 && filtered.length === 0 && (
        <p className="text-gray-600">条件に合うゲームがありません。</p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filtered.map((game) => (
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
                <p className="truncate text-xs text-gray-400">{game.ownerName}</p>
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
