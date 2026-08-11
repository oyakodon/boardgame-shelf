import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { CreateGameRequest, Member } from "../../shared/types";
import { createGame, getGame, listMembers, updateGame } from "../api";
import { useAuth } from "../auth-context";
import { extractBggId } from "../bgg";

type Mode = "create" | "edit";

type FormState = {
  title: string;
  ownerId: string;
  minPlayers: string;
  maxPlayers: string;
  playTimeMin: string;
  playTimeMax: string;
  note: string;
  bggId: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  ownerId: "",
  minPlayers: "",
  maxPlayers: "",
  playTimeMin: "",
  playTimeMax: "",
  note: "",
  bggId: "",
};

function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : Number.NaN;
}

export function GameFormPage({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMembers()
      .then(setMembers)
      .catch((err: unknown) =>
        setMembersError(err instanceof Error ? err.message : "メンバー一覧の取得に失敗しました"),
      );
  }, []);

  // メンバー一覧の取得に失敗しても、最低限「自分」だけは所有者に選べるようにする
  const ownerOptions =
    user && !members.some((m) => m.id === user.id)
      ? [{ id: user.id, displayName: user.displayName }, ...members]
      : members;

  // 新規登録では既定の所有者を自分にする(代理登録のときだけ選び直す)
  useEffect(() => {
    if (mode === "create" && user) {
      setForm((prev) => (prev.ownerId ? prev : { ...prev, ownerId: user.id }));
    }
  }, [mode, user]);

  useEffect(() => {
    if (mode !== "edit" || !id) {
      return;
    }
    getGame(id)
      .then((game) => {
        if (!game) {
          setError("ゲームが見つかりませんでした。");
          return;
        }
        setForm({
          title: game.title,
          ownerId: game.ownerId,
          minPlayers: String(game.minPlayers),
          maxPlayers: game.maxPlayers !== null ? String(game.maxPlayers) : "",
          playTimeMin: game.playTimeMin !== null ? String(game.playTimeMin) : "",
          playTimeMax: game.playTimeMax !== null ? String(game.playTimeMax) : "",
          note: game.note ?? "",
          bggId: game.bggId !== null ? String(game.bggId) : "",
        });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [mode, id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const minPlayers = toOptionalInt(form.minPlayers);
    const maxPlayers = toOptionalInt(form.maxPlayers);
    const playTimeMin = toOptionalInt(form.playTimeMin);
    const playTimeMax = toOptionalInt(form.playTimeMax);
    const bggId = form.bggId.trim() ? extractBggId(form.bggId) : null;

    if (!form.title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
    if (minPlayers === null || Number.isNaN(minPlayers) || minPlayers < 1) {
      setError("最小人数は1以上の整数で入力してください。");
      return;
    }
    if ([maxPlayers, playTimeMin, playTimeMax].some((n) => n !== null && (Number.isNaN(n) || n < 1))) {
      setError("数値項目は1以上の整数で入力してください。");
      return;
    }
    if (form.bggId.trim() && bggId === null) {
      setError("BGGのIDまたはURLを正しく入力してください。");
      return;
    }
    if (maxPlayers !== null && minPlayers > maxPlayers) {
      setError("最小人数は最大人数以下にしてください。");
      return;
    }

    const body: CreateGameRequest = {
      title: form.title.trim(),
      minPlayers,
      maxPlayers,
      playTimeMin,
      playTimeMax,
      note: form.note.trim() || null,
      bggId,
    };
    if (form.ownerId) {
      body.ownerId = form.ownerId;
    }

    setSubmitting(true);
    try {
      const game = mode === "edit" && id ? await updateGame(id, body) : await createGame(body);
      navigate(`/games/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
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

  return (
    <main className="mx-auto max-w-lg p-4 pb-8">
      <Link to={mode === "edit" && id ? `/games/${id}` : "/"} className="text-sm text-indigo-600 active:underline">
        ← 戻る
      </Link>

      <h1 className="mt-2 mb-4 text-xl font-bold text-gray-900">{mode === "edit" ? "ゲームを編集" : "ゲームを登録"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            タイトル<span className="text-red-600">*</span>
          </label>
          <input
            id="title"
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
          />
        </div>

        <div>
          <label htmlFor="ownerId" className="block text-sm font-medium text-gray-700">
            所有者<span className="text-red-600">*</span>
          </label>
          <select
            id="ownerId"
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
          {membersError && <p className="mt-1 text-xs text-red-600">{membersError}(自分のみ選択できます)</p>}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="minPlayers" className="block text-sm font-medium text-gray-700">
              最小人数<span className="text-red-600">*</span>
            </label>
            <input
              id="minPlayers"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.minPlayers}
              onChange={(e) => updateField("minPlayers", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-700">
              最大人数
            </label>
            <input
              id="maxPlayers"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.maxPlayers}
              onChange={(e) => updateField("maxPlayers", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            />
            <p className="mt-1 text-xs text-gray-500">空欄なら上限なし</p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="playTimeMin" className="block text-sm font-medium text-gray-700">
              プレイ時間(分・最小)
            </label>
            <input
              id="playTimeMin"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.playTimeMin}
              onChange={(e) => updateField("playTimeMin", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="playTimeMax" className="block text-sm font-medium text-gray-700">
              プレイ時間(分・最大)
            </label>
            <input
              id="playTimeMax"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.playTimeMax}
              onChange={(e) => updateField("playTimeMax", e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>
        </div>

        <div>
          <label htmlFor="bggId" className="block text-sm font-medium text-gray-700">
            BGG ID
          </label>
          <input
            id="bggId"
            type="text"
            value={form.bggId}
            onChange={(e) => updateField("bggId", e.target.value)}
            placeholder="13 または https://boardgamegeek.com/boardgame/13/catan"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2.5 text-base"
          />
          <p className="mt-1 text-xs text-gray-500">ゲームページのURLを貼り付けてもIDだけ保存されます</p>
        </div>

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

        {error && <p className="text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-12 w-full rounded bg-indigo-600 px-4 text-white active:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "保存中..." : "保存"}
        </button>
      </form>
    </main>
  );
}
