import { useRef, useState } from "react";
import type { GamePhoto } from "../../shared/types";
import { deletePhoto, uploadGamePhoto } from "../api";
import { resizeImageToJpeg } from "../image-resize";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

type PhotoManagerProps = {
  gameId: string;
  photos: GamePhoto[];
  onPhotosChange: (photos: GamePhoto[]) => void;
};

export function PhotoManager({ gameId, photos, onPhotosChange }: PhotoManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setError(`写真は${MAX_PHOTOS}枚まで登録できます。`);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const resized = await resizeImageToJpeg(file);
      if (resized.size > MAX_PHOTO_BYTES) {
        setError("画像サイズが大きすぎます。");
        return;
      }
      const photo = await uploadGamePhoto(gameId, resized);
      onPhotosChange([...photos, photo]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function handleDeletePhoto(photoId: string) {
    if (!window.confirm("この写真を削除しますか？")) {
      return;
    }
    deletePhoto(photoId)
      .then(() => onPhotosChange(photos.filter((p) => p.id !== photoId)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "削除に失敗しました"));
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto">
        {photos.map((photo) => (
          <div key={photo.id} className="relative shrink-0">
            <img src={photo.url} alt="" className="h-32 w-32 rounded-lg border border-gray-200 object-cover" />
            <button
              type="button"
              onClick={() => handleDeletePhoto(photo.id)}
              aria-label="この写真を削除"
              className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
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
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
