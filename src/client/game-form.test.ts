import { describe, expect, it } from "vitest";
import type { GameDetail } from "../shared/types";
import { EMPTY_FORM, type FormState, gameToFormState, toOptionalInt, validateGameForm } from "./game-form";

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    ...EMPTY_FORM,
    title: "カタン",
    minPlayers: "3",
    maxPlayers: "4",
    ...overrides,
  };
}

function makeGame(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    id: "game-1",
    ownerId: "owner-1",
    ownerName: "オーナー",
    registeredById: "owner-1",
    registeredByName: "オーナー",
    title: "カタン",
    minPlayers: 3,
    maxPlayers: 4,
    playTimeMin: null,
    playTimeMax: null,
    note: null,
    bggId: null,
    bgaSlug: null,
    status: "available",
    thumbnailUrl: null,
    tagNames: [],
    createdAt: 0,
    updatedAt: 0,
    photos: [],
    tags: [],
    ...overrides,
  };
}

describe("toOptionalInt", () => {
  it("returns null for empty/whitespace input", () => {
    expect(toOptionalInt("")).toBeNull();
    expect(toOptionalInt("  ")).toBeNull();
  });

  it("returns the parsed integer for valid input", () => {
    expect(toOptionalInt("3")).toBe(3);
  });

  it("returns NaN for non-integer input", () => {
    expect(toOptionalInt("abc")).toBeNaN();
    expect(toOptionalInt("1.5")).toBeNaN();
  });
});

describe("gameToFormState", () => {
  it("converts a GameDetail into form field strings", () => {
    const game = makeGame({
      maxPlayers: null,
      playTimeMin: 30,
      playTimeMax: null,
      note: "拡張入り",
      bggId: 13,
      bgaSlug: "catan",
    });

    expect(gameToFormState(game)).toEqual({
      title: "カタン",
      ownerId: "owner-1",
      minPlayers: "3",
      maxPlayers: "",
      playTimeMin: "30",
      playTimeMax: "",
      note: "拡張入り",
      bggId: "13",
      bgaSlug: "catan",
    });
  });

  it("falls back to empty string for null note/bgaSlug", () => {
    const game = makeGame({ note: null, bgaSlug: null });
    const form = gameToFormState(game);
    expect(form.note).toBe("");
    expect(form.bgaSlug).toBe("");
  });
});

describe("validateGameForm", () => {
  it("rejects an empty title", () => {
    const result = validateGameForm(makeForm({ title: "  " }));
    expect(result).toEqual({ ok: false, error: "タイトルを入力してください。" });
  });

  it("rejects a missing minPlayers", () => {
    const result = validateGameForm(makeForm({ minPlayers: "" }));
    expect(result).toEqual({ ok: false, error: "最小人数は1以上の整数で入力してください。" });
  });

  it("rejects a non-integer minPlayers", () => {
    const result = validateGameForm(makeForm({ minPlayers: "abc" }));
    expect(result).toEqual({ ok: false, error: "最小人数は1以上の整数で入力してください。" });
  });

  it("rejects minPlayers of 0", () => {
    const result = validateGameForm(makeForm({ minPlayers: "0" }));
    expect(result).toEqual({ ok: false, error: "最小人数は1以上の整数で入力してください。" });
  });

  it("rejects maxPlayers less than minPlayers", () => {
    const result = validateGameForm(makeForm({ minPlayers: "5", maxPlayers: "2" }));
    expect(result).toEqual({ ok: false, error: "最小人数は最大人数以下にしてください。" });
  });

  it("rejects playTimeMax less than playTimeMin", () => {
    const result = validateGameForm(makeForm({ playTimeMin: "60", playTimeMax: "30" }));
    expect(result).toEqual({ ok: false, error: "プレイ時間は最小が最大以下になるようにしてください。" });
  });

  it("rejects an invalid BGG id/URL", () => {
    const result = validateGameForm(makeForm({ bggId: "not-a-valid-id-or-url" }));
    expect(result).toEqual({ ok: false, error: "BGGのIDまたはURLを正しく入力してください。" });
  });

  it("rejects an invalid BGA slug/URL", () => {
    const result = validateGameForm(makeForm({ bgaSlug: "invalid slug!!" }));
    expect(result).toEqual({ ok: false, error: "BGAのIDまたはURLを正しく入力してください。" });
  });

  it("converts all empty optional fields to null", () => {
    const result = validateGameForm(makeForm({ maxPlayers: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toMatchObject({
        maxPlayers: null,
        playTimeMin: null,
        playTimeMax: null,
        note: null,
        bggId: null,
        bgaSlug: null,
      });
    }
  });

  it("omits ownerId from the body when the form field is empty", () => {
    const result = validateGameForm(makeForm({ ownerId: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.ownerId).toBeUndefined();
      expect("ownerId" in result.body).toBe(false);
    }
  });

  it("includes ownerId in the body when the form field is set", () => {
    const result = validateGameForm(makeForm({ ownerId: "owner-2" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.ownerId).toBe("owner-2");
    }
  });
});
