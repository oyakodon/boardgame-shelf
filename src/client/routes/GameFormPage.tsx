import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Member } from "../../shared/types";
import { createGame, deletePhoto, errorMessage, getGame, listMembers, updateGame, uploadGamePhoto } from "../api";
import { useAuth } from "../auth-context";
import { NumberField } from "../components/NumberField";
import { EMPTY_PHOTO_VALUE, PhotoPicker, type PhotoPickerValue } from "../components/PhotoPicker";
import { TextField } from "../components/TextField";
import { EMPTY_FORM, type FormState, gameToFormState, validateGameForm } from "../game-form";

type Mode = "create" | "edit";

export function GameFormPage({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialOwner, setInitialOwner] = useState<Member | null>(null);
  const [photoValue, setPhotoValue] = useState<PhotoPickerValue>(EMPTY_PHOTO_VALUE);
  // 新規登録で「ゲームは作成できたが写真のアップロードに失敗した」場合、
  // 保存をやり直してもゲームを二重に作らないよう作成済みのIDを覚えておく
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);

  useEffect(() => {
    listMembers()
      .then(setMembers)
      .catch((err: unknown) => setMembersError(errorMessage(err, "メンバー一覧の取得に失敗しました")));
  }, []);

  // メンバー一覧の取得に失敗しても、最低限「自分」と編集中ゲームの元々の所有者だけは選べるようにする
  const ownerOptions = [
    ...(user && !members.some((m) => m.id === user.id) ? [{ id: user.id, displayName: user.displayName }] : []),
    ...(initialOwner && initialOwner.id !== user?.id && !members.some((m) => m.id === initialOwner.id)
      ? [initialOwner]
      : []),
    ...members,
  ];

  // 新規登録では既定の所有者を自分にする(代理登録のときだけ選び直す)
  useEffect(() => {
    if (mode === "create" && user) {
      setForm((prev) => (prev.ownerId ? prev : { ...prev, ownerId: user.id }));
    }
  }, [mode, user]);

  useEffect(() => {
    if (mode !== "edit" || !id) {
      setLoading(false);
      return;
    }
    getGame(id)
      .then((game) => {
        if (!game) {
          setNotFound(true);
          return;
        }
        setForm(gameToFormState(game));
        setInitialOwner({ id: game.ownerId, displayName: game.ownerName });
        setPhotoValue({ kept: game.photos, removedIds: [], added: [] });
      })
      .catch((err: unknown) => setError(errorMessage(err, "取得に失敗しました")))
      .finally(() => setLoading(false));
  }, [mode, id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 写真の削除と追加を順に反映する。1件終えるごとに状態から取り除くので、
  // 途中で失敗して保存をやり直しても、成功済みの分をやり直すことはない
  async function persistPhotoChanges(gameId: string) {
    for (const photoId of photoValue.removedIds) {
      await deletePhoto(photoId);
      setPhotoValue((prev) => ({ ...prev, removedIds: prev.removedIds.filter((x) => x !== photoId) }));
    }
    for (const pending of photoValue.added) {
      await uploadGamePhoto(gameId, pending.blob);
      setPhotoValue((prev) => ({ ...prev, added: prev.added.filter((a) => a.key !== pending.key) }));
      URL.revokeObjectURL(pending.previewUrl);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const result = validateGameForm(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const body = result.body;

    setSubmitting(true);
    try {
      let gameId: string;
      if (mode === "edit" && id) {
        gameId = (await updateGame(id, body)).id;
      } else if (createdGameId) {
        // 前回の保存でゲームは作成済み。作り直さず内容を反映するだけにする
        gameId = (await updateGame(createdGameId, body)).id;
      } else {
        gameId = (await createGame(body)).id;
        setCreatedGameId(gameId);
      }

      await persistPhotoChanges(gameId);
      navigate(`/games/${gameId}`);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <p className="text-gray-600">読み込み中...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <p className="text-gray-600">ゲームが見つかりませんでした。</p>
        <Link to="/" className="text-indigo-600 hover:underline">
          一覧に戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-4 pb-8">
      <Link to={mode === "edit" && id ? `/games/${id}` : "/"} className="text-sm text-indigo-600 active:underline">
        ← 戻る
      </Link>

      <h1 className="mt-2 mb-4 text-xl font-bold text-gray-900">{mode === "edit" ? "ゲームを編集" : "ゲームを登録"}</h1>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={submitting} className="space-y-4">
          <div>
            <span className="block text-sm font-medium text-gray-700">写真</span>
            <div className="mt-1">
              <PhotoPicker value={photoValue} onChange={setPhotoValue} />
            </div>
          </div>

          <TextField
            id="title"
            label="タイトル"
            required
            value={form.title}
            onChange={(value) => updateField("title", value)}
          />

          <div>
            <label htmlFor="ownerId" className="block text-sm font-medium text-gray-700">
              所有者<span className="text-red-600">*</span>
            </label>
            <select
              id="ownerId"
              required
              aria-required="true"
              value={form.ownerId}
              onChange={(e) => updateField("ownerId", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            >
              {ownerOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.id === user?.id ? `${member.displayName}(自分)` : member.displayName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">他の人の持ち物を代理で登録するときは選び直してください</p>
            {membersError && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {membersError}(自分のみ選択できます)
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <NumberField
              id="minPlayers"
              label="最小人数"
              required
              value={form.minPlayers}
              onChange={(value) => updateField("minPlayers", value)}
            />
            <NumberField
              id="maxPlayers"
              label="最大人数"
              value={form.maxPlayers}
              onChange={(value) => updateField("maxPlayers", value)}
              helperText="空欄なら上限なし"
            />
          </div>

          <div className="flex gap-3">
            <NumberField
              id="playTimeMin"
              label="プレイ時間(分・最小)"
              value={form.playTimeMin}
              onChange={(value) => updateField("playTimeMin", value)}
            />
            <NumberField
              id="playTimeMax"
              label="プレイ時間(分・最大)"
              value={form.playTimeMax}
              onChange={(value) => updateField("playTimeMax", value)}
            />
          </div>

          <TextField
            id="bggId"
            label="BGG ID"
            value={form.bggId}
            onChange={(value) => updateField("bggId", value)}
            placeholder="13 または https://boardgamegeek.com/boardgame/13/catan"
            helperText="ゲームページのURLを貼り付けてもIDだけ保存されます"
          />

          <TextField
            id="bgaSlug"
            label="BGA(ボードゲームアリーナ)"
            value={form.bgaSlug}
            onChange={(value) => updateField("bgaSlug", value)}
            placeholder="raceforthegalaxy または https://boardgamearena.com/gamepanel?game=raceforthegalaxy"
            helperText="ゲームページのURLを貼り付けてもIDだけ保存されます"
          />
          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700">
              コメント
            </label>
            <textarea
              id="note"
              rows={3}
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          {error && (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="min-h-12 w-full rounded bg-indigo-600 px-4 text-white active:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存"}
          </button>
        </fieldset>
      </form>
    </main>
  );
}
