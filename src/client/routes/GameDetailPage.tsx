import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { GameDetail, Tag } from "../../shared/types";
import { addGameTag, deleteGame, getGame, listTags, removeGameTag } from "../api";
import { useAuth } from "../auth-context";
import { bgaUrl } from "../bga";
import { PhotoViewer } from "../components/PhotoViewer";
import { playersLabel } from "../game-format";

function playTimeLabel(game: GameDetail): string | null {
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
  const [game, setGame] = useState<GameDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    getGame(id)
      .then(setGame)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "取得に失敗しました"));
  }, [id]);

  useEffect(() => {
    listTags()
      .then(setAvailableTags)
      .catch(() => {});
  }, []);

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

  // 所有者だけでなく登録者(代理登録した人)も編集できる
  const canEdit = user?.id === game.ownerId || user?.id === game.registeredById || user?.role === "admin";
  const time = playTimeLabel(game);

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    const name = tagInput.trim();
    if (!name || !game) {
      return;
    }
    setTagError(null);
    try {
      const tags = await addGameTag(game.id, name);
      setGame((prev) => (prev ? { ...prev, tags, tagNames: tags.map((t) => t.name) } : prev));
      setTagInput("");
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "タグの追加に失敗しました");
    }
  }

  function handleRemoveTag(tagId: string) {
    if (!game) return;
    removeGameTag(game.id, tagId)
      .then(() => {
        setGame((prev) => {
          if (!prev) return prev;
          const tags = prev.tags.filter((t) => t.id !== tagId);
          return { ...prev, tags, tagNames: tags.map((t) => t.name) };
        });
      })
      .catch((err: unknown) => setTagError(err instanceof Error ? err.message : "タグの削除に失敗しました"));
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← 一覧に戻る
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{game.title}</h1>

      {game.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {game.photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setViewerIndex(i)}
              aria-label={`${i + 1}枚目の写真を拡大表示`}
              className="block shrink-0"
            >
              <img src={photo.url} alt="" className="h-32 w-32 rounded-lg border border-gray-200 object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {game.tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
          >
            #{tag.name}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag.id)}
              aria-label={`タグ「${tag.name}」を削除`}
              className="text-gray-400 active:text-gray-700"
            >
              ×
            </button>
          </span>
        ))}
        <form onSubmit={handleAddTag} className="flex items-center gap-1">
          <input
            list="tag-suggestions"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="タグを追加"
            maxLength={30}
            className="min-h-8 w-28 rounded-full border border-gray-300 px-3 text-sm"
          />
          <datalist id="tag-suggestions">
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={tagInput.trim().length === 0}
            className="min-h-8 rounded-full border border-gray-300 px-3 text-sm text-gray-700 active:bg-gray-100 disabled:opacity-50"
          >
            追加
          </button>
        </form>
      </div>
      {tagError && <p className="mt-1 text-sm text-red-600">{tagError}</p>}

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
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                #{game.bggId}
              </a>
            </dd>
          </div>
        )}
        {game.bgaSlug !== null && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">BGA</dt>
            <dd className="text-gray-900">
              <a
                href={bgaUrl(game.bgaSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                {game.bgaSlug}
              </a>
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-20 text-gray-500">所有者</dt>
          <dd className="text-gray-900">{game.ownerId === user?.id ? `自分(${game.ownerName})` : game.ownerName}</dd>
        </div>
        {game.registeredByName && game.registeredById !== game.ownerId && (
          <div className="flex gap-2">
            <dt className="w-20 text-gray-500">登録者</dt>
            <dd className="text-gray-900">
              {game.registeredById === user?.id ? `自分(${game.registeredByName})` : game.registeredByName}
            </dd>
          </div>
        )}
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
              setActionError(null);
              deleteGame(game.id)
                .then(() => navigate("/"))
                .catch((err: unknown) => setActionError(err instanceof Error ? err.message : "削除に失敗しました"));
            }}
            className="min-h-12 flex-1 rounded border border-red-300 text-red-600 active:bg-red-50"
          >
            削除
          </button>
        </div>
      )}
      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

      <PhotoViewer
        photos={game.photos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onIndexChange={setViewerIndex}
      />
    </main>
  );
}
