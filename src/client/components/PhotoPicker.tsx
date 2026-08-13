import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_GAME } from "../../shared/constants";
import type { GamePhoto } from "../../shared/types";
import { errorMessage } from "../api";
import { resizeImageToJpeg } from "../image-resize";

// 未アップロードの写真。保存時にまとめてアップロードする
export type PendingPhoto = {
  key: string;
  blob: Blob;
  previewUrl: string;
};

// フォームが保持する写真の状態。フォーム自身は保存されるまでサーバーに触らない
export type PhotoPickerValue = {
  kept: GamePhoto[]; // 既存の写真のうち残すもの
  removedIds: string[]; // 既存の写真のうち削除するもの
  added: PendingPhoto[]; // 新しく選ばれた、まだアップロードしていない写真
};

export const EMPTY_PHOTO_VALUE: PhotoPickerValue = { kept: [], removedIds: [], added: [] };

export function photoCount(value: PhotoPickerValue): number {
  return value.kept.length + value.added.length;
}

type PhotoPickerProps = {
  value: PhotoPickerValue;
  onChange: Dispatch<SetStateAction<PhotoPickerValue>>;
};

export function PhotoPicker({ value, onChange }: PhotoPickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // アンマウント時点で残っているプレビューのObject URLを解放する。
  // クリーンアップ関数が最新の値を読めるようrefを経由する(依存配列に入れると
  // 写真を1枚足すたびに解放されてしまうため)
  const addedRef = useRef(value.added);
  addedRef.current = value.added;

  useEffect(() => {
    return () => {
      for (const pending of addedRef.current) {
        URL.revokeObjectURL(pending.previewUrl);
      }
    };
  }, []);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (photoCount(value) >= MAX_PHOTOS_PER_GAME) {
      setError(`写真は${MAX_PHOTOS_PER_GAME}枚まで登録できます。`);
      return;
    }

    setError(null);
    setProcessing(true);
    try {
      const blob = await resizeImageToJpeg(file);
      if (blob.size > MAX_PHOTO_BYTES) {
        setError("画像サイズが大きすぎます。");
        return;
      }
      const pending: PendingPhoto = {
        key: crypto.randomUUID(),
        blob,
        previewUrl: URL.createObjectURL(blob),
      };
      onChange((prev) => ({ ...prev, added: [...prev.added, pending] }));
    } catch (err) {
      setError(errorMessage(err, "画像の読み込みに失敗しました"));
    } finally {
      setProcessing(false);
    }
  }

  function removeKept(photoId: string) {
    onChange((prev) => ({
      ...prev,
      kept: prev.kept.filter((p) => p.id !== photoId),
      removedIds: [...prev.removedIds, photoId],
    }));
  }

  function removeAdded(key: string) {
    onChange((prev) => {
      const target = prev.added.find((a) => a.key === key);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return { ...prev, added: prev.added.filter((a) => a.key !== key) };
    });
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto">
        {value.kept.map((photo) => (
          <PhotoThumbnail key={photo.id} src={photo.url} onRemove={() => removeKept(photo.id)} />
        ))}
        {value.added.map((pending) => (
          <PhotoThumbnail key={pending.key} src={pending.previewUrl} onRemove={() => removeAdded(pending.key)} />
        ))}
        {photoCount(value) < MAX_PHOTOS_PER_GAME && (
          <label className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-300 border-dashed text-gray-500 active:bg-gray-50">
            <span className="text-2xl">{processing ? "…" : "+"}</span>
            <span className="text-xs">{processing ? "読み込み中" : "写真を追加"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function PhotoThumbnail({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative shrink-0">
      <img src={src} alt="" className="h-32 w-32 rounded-lg border border-gray-200 object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="この写真を削除"
        className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
      >
        ×
      </button>
    </div>
  );
}
