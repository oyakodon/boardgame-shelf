import type { CreateGameRequest, GameDetail } from "../shared/types";
import { extractBgaSlug } from "./bga";
import { extractBggId } from "./bgg";

export type FormState = {
  title: string;
  ownerId: string;
  minPlayers: string;
  maxPlayers: string;
  playTimeMin: string;
  playTimeMax: string;
  note: string;
  bggId: string;
  bgaSlug: string;
};

export const EMPTY_FORM: FormState = {
  title: "",
  ownerId: "",
  minPlayers: "",
  maxPlayers: "",
  playTimeMin: "",
  playTimeMax: "",
  note: "",
  bggId: "",
  bgaSlug: "",
};

export function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : Number.NaN;
}

export function gameToFormState(game: GameDetail): FormState {
  return {
    title: game.title,
    ownerId: game.ownerId,
    minPlayers: String(game.minPlayers),
    maxPlayers: game.maxPlayers !== null ? String(game.maxPlayers) : "",
    playTimeMin: game.playTimeMin !== null ? String(game.playTimeMin) : "",
    playTimeMax: game.playTimeMax !== null ? String(game.playTimeMax) : "",
    note: game.note ?? "",
    bggId: game.bggId !== null ? String(game.bggId) : "",
    bgaSlug: game.bgaSlug ?? "",
  };
}

export type ValidateGameFormResult = { ok: true; body: CreateGameRequest } | { ok: false; error: string };

export function validateGameForm(form: FormState): ValidateGameFormResult {
  const minPlayers = toOptionalInt(form.minPlayers);
  const maxPlayers = toOptionalInt(form.maxPlayers);
  const playTimeMin = toOptionalInt(form.playTimeMin);
  const playTimeMax = toOptionalInt(form.playTimeMax);
  const bggId = form.bggId.trim() ? extractBggId(form.bggId) : null;
  const bgaSlug = form.bgaSlug.trim() ? extractBgaSlug(form.bgaSlug) : null;

  if (!form.title.trim()) {
    return { ok: false, error: "タイトルを入力してください。" };
  }
  if (minPlayers === null || Number.isNaN(minPlayers) || minPlayers < 1) {
    return { ok: false, error: "最小人数は1以上の整数で入力してください。" };
  }
  if ([maxPlayers, playTimeMin, playTimeMax].some((n) => n !== null && (Number.isNaN(n) || n < 1))) {
    return { ok: false, error: "数値項目は1以上の整数で入力してください。" };
  }
  if (form.bggId.trim() && bggId === null) {
    return { ok: false, error: "BGGのIDまたはURLを正しく入力してください。" };
  }
  if (form.bgaSlug.trim() && bgaSlug === null) {
    return { ok: false, error: "BGAのIDまたはURLを正しく入力してください。" };
  }
  if (maxPlayers !== null && minPlayers > maxPlayers) {
    return { ok: false, error: "最小人数は最大人数以下にしてください。" };
  }

  const body: CreateGameRequest = {
    title: form.title.trim(),
    minPlayers,
    maxPlayers,
    playTimeMin,
    playTimeMax,
    note: form.note.trim() || null,
    bggId,
    bgaSlug,
  };
  if (form.ownerId) {
    body.ownerId = form.ownerId;
  }
  return { ok: true, body };
}
