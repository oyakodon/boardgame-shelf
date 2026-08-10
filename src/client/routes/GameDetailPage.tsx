import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { GameDetail } from "../../shared/types";
import { deleteGame, deletePhoto, getGame, uploadGamePhoto } from "../api";
import { useAuth } from "../auth-context";
import { playersLabel } from "../game-format";
import { resizeImageToJpeg } from "../image-resize";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

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
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !game) {
      return;
    }
    if (game.photos.length >= MAX_PHOTOS) {
      setPhotoError(`写真は${MAX_PHOTOS}枚まで登録できます。`);
      return;
    }

    setPhotoError(null);
    setUploading(true);
    try {
      const resized = await resizeImageToJpeg(file);
      if (resized.size > MAX_PHOTO_BYTES) {
        setPhotoError("画像サイズが大きすぎます。");
        return;
      }
      const photo = await uploadGamePhoto(game.id, resized);
      setGame((prev) =>
        prev
          ? {
              ...prev,
              photos: [...prev.photos, photo],
              thumbnailUrl: prev.thumbnailUrl ?? photo.url,
            }
          : prev,
      );
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function handleDeletePhoto(photoId: string) {
    if (!window.confirm("この写真を削除しますか？")) {
      return;
    }
    deletePhoto(photoId)
      .then(() => {
        setGame((prev) => {
          if (!prev) return prev;
          const photos = prev.photos.filter((p) => p.id !== photoId);
          return { ...prev, photos, thumbnailUrl: photos[0]?.url ?? null };
        });
      })
      .catch((err: unknown) => setPhotoError(err instanceof Error ? err.message : "削除に失敗しました"));
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← 一覧に戻る
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-gray-900">{game.title}</h1>

      <div className="mt-3 flex gap-2 overflow-x-auto">
        {game.photos.map((photo) => (
          <div key={photo.id} className="relative shrink-0">
            <img src={photo.url} alt="" className="h-32 w-32 rounded-lg border border-gray-200 object-cover" />
            {canEdit && (
              <button
                type="button"
                onClick={() => handleDeletePhoto(photo.id)}
                aria-label="この写真を削除"
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canEdit && game.photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-300 border-dashed text-gray-500 active:bg-gray-50 disabled:opacity-50"
          >
            <span className="text-2xl">{uploading ? "…" : "+"}</span>
            <span className="text-xs">{uploading ? "アップロード中" : "写真を追加"}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
      {photoError && <p className="mt-1 text-sm text-red-600">{photoError}</p>}

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
