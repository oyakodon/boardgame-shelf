import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Game } from "../../shared/types";
import { deleteGame, getGame } from "../api";
import { useAuth } from "../auth-context";
import { playersLabel } from "../game-format";

function playTimeLabel(game: Game): string | null {
  if (game.playTimeMin === null && game.playTimeMax === null) {
    return null;
  }
  if (game.playTimeMin !== null && game.playTimeMax !== null && game.playTimeMin !== game.playTimeMax) {
    return `${game.playTimeMin}〜${game.playTimeMax}分`;
  }
  return `${game.playTimeMin ?? game.playTimeMax}分`;
}

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    getGame(id)
      .then(setGame)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "取得に失敗しました"));
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (game === undefined) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <p className="text-gray-600">読み込み中...</p>
      </main>
    );
  }

  if (game === null || !id) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <p className="text-gray-600">ゲームが見つかりませんでした。</p>
        <Link to="/" className="text-indigo-600 hover:underline">
          一覧に戻る
        </Link>
      </main>
    );
  }

  const canEdit = user?.id === game.ownerId || user?.role === "admin";
  const time = playTimeLabel(game);

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← 一覧に戻る
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{game.title}</h1>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 text-gray-500">人数</dt>
          <dd className="text-gray-900">{playersLabel(game)}</dd>
        </div>
        {time && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">プレイ時間</dt>
            <dd className="text-gray-900">{time}</dd>
          </div>
        )}
        {game.note && (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-gray-500">コメント</dt>
            <dd className="whitespace-pre-wrap text-gray-900">{game.note}</dd>
          </div>
        )}
        {game.bggId !== null && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">BGG</dt>
            <dd className="text-gray-900">
              <a
                href={`https://boardgamegeek.com/boardgame/${game.bggId}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:underline"
              >
                #{game.bggId}
              </a>
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-20 text-gray-500">所有者</dt>
          <dd className="text-gray-900">{game.ownerId === user?.id ? "自分" : "他のメンバー"}</dd>
        </div>
        {game.status === "retired" && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">状態</dt>
            <dd className="text-gray-900">整理済み</dd>
          </div>
        )}
      </dl>

      {canEdit && (
        <div className="mt-6 flex gap-2">
          <Link
            to={`/games/${game.id}/edit`}
            className="flex min-h-12 flex-1 items-center justify-center rounded border border-gray-300 text-gray-700 active:bg-gray-100"
          >
            編集
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`「${game.title}」を削除しますか？`)) {
                return;
              }
              deleteGame(game.id)
                .then(() => navigate("/"))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "削除に失敗しました"));
            }}
            className="min-h-12 flex-1 rounded border border-red-300 text-red-600 active:bg-red-50"
          >
            削除
          </button>
        </div>
      )}
    </main>
  );
}
