import { useEffect, useRef } from "react";
import type { GamePhoto } from "../../shared/types";

type PhotoViewerProps = {
  photos: GamePhoto[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export function PhotoViewer({ photos, index, onClose, onIndexChange }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = index !== null;
  const photo = index !== null ? photos[index] : undefined;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || index === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (index === null) return;
      if (e.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      } else if (e.key === "ArrowRight" && index < photos.length - 1) {
        onIndexChange(index + 1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, index, photos.length, onIndexChange]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="写真の拡大表示"
      className="m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-0 backdrop:bg-black/90"
    >
      {isOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: 背景タップで閉じるマウス専用の補助操作。Escでの閉じる操作はdialogがネイティブに提供する
        // biome-ignore lint/a11y/useKeyWithClickEvents: 同上
        <div
          className="relative flex h-full w-full items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialogRef.current?.close();
          }}
        >
          {photo && <img src={photo.url} alt="" className="max-h-full max-w-full object-contain" />}

          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="閉じる"
            className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-[calc(0.75rem+env(safe-area-inset-right))] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl text-white active:bg-black/80"
          >
            ×
          </button>

          {photo && index !== null && index > 0 && (
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              aria-label="前の写真"
              className="absolute left-[calc(0.5rem+env(safe-area-inset-left))] flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-2xl text-white active:bg-black/80"
            >
              ‹
            </button>
          )}
          {photo && index !== null && index < photos.length - 1 && (
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              aria-label="次の写真"
              className="absolute right-[calc(0.5rem+env(safe-area-inset-right))] flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-2xl text-white active:bg-black/80"
            >
              ›
            </button>
          )}

          {photo && index !== null && photos.length > 1 && (
            <p className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] rounded-full bg-black/60 px-3 py-1 text-sm text-white">
              {index + 1} / {photos.length}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
