import type { Context } from "hono";
import type { CreateGameRequest, GameStatus, UpdateGameRequest } from "../../shared/types";
import type { Variables } from "../auth/middleware";
import { getGameById, insertGame, listActiveGames, softDeleteGame, updateGame } from "../db";
import type { Bindings } from "../env";

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isOptionalPositiveInt(value: unknown): boolean {
  return value === undefined || value === null || isPositiveInt(value);
}

function isOptionalStatus(value: unknown): value is GameStatus | undefined {
  return value === undefined || value === "available" || value === "retired";
}

function parseCreateGameRequest(body: unknown): CreateGameRequest | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const b = body as Record<string, unknown>;
  if (!isNonEmptyString(b.title)) {
    return null;
  }
  if (!isPositiveInt(b.minPlayers)) {
    return null;
  }
  if (
    !isOptionalPositiveInt(b.maxPlayers) ||
    !isOptionalPositiveInt(b.playTimeMin) ||
    !isOptionalPositiveInt(b.playTimeMax) ||
    !isOptionalString(b.note) ||
    !isOptionalPositiveInt(b.bggId)
  ) {
    return null;
  }
  if (typeof b.maxPlayers === "number" && b.minPlayers > b.maxPlayers) {
    return null;
  }

  return {
    title: b.title.trim(),
    minPlayers: b.minPlayers,
    maxPlayers: (b.maxPlayers as number | null | undefined) ?? null,
    playTimeMin: (b.playTimeMin as number | null | undefined) ?? null,
    playTimeMax: (b.playTimeMax as number | null | undefined) ?? null,
    note: (b.note as string | null | undefined) ?? null,
    bggId: (b.bggId as number | null | undefined) ?? null,
  };
}

function parseUpdateGameRequest(body: unknown): UpdateGameRequest | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const b = body as Record<string, unknown>;

  if (b.title !== undefined && !isNonEmptyString(b.title)) {
    return null;
  }
  if (b.minPlayers !== undefined && !isPositiveInt(b.minPlayers)) {
    return null;
  }
  if (typeof b.minPlayers === "number" && typeof b.maxPlayers === "number" && b.minPlayers > b.maxPlayers) {
    return null;
  }
  if (
    !isOptionalPositiveInt(b.maxPlayers) ||
    !isOptionalPositiveInt(b.playTimeMin) ||
    !isOptionalPositiveInt(b.playTimeMax) ||
    !isOptionalString(b.note) ||
    !isOptionalPositiveInt(b.bggId) ||
    !isOptionalStatus(b.status)
  ) {
    return null;
  }

  const patch: UpdateGameRequest = {};
  if (b.title !== undefined) patch.title = (b.title as string).trim();
  if (b.minPlayers !== undefined) patch.minPlayers = b.minPlayers as number;
  if (b.maxPlayers !== undefined) patch.maxPlayers = b.maxPlayers as number | null;
  if (b.playTimeMin !== undefined) patch.playTimeMin = b.playTimeMin as number | null;
  if (b.playTimeMax !== undefined) patch.playTimeMax = b.playTimeMax as number | null;
  if (b.note !== undefined) patch.note = b.note as string | null;
  if (b.bggId !== undefined) patch.bggId = b.bggId as number | null;
  if (b.status !== undefined) patch.status = b.status as GameStatus;
  return patch;
}

export async function listGames(c: AppContext) {
  const games = await listActiveGames(c.env.DB);
  return c.json(games);
}

export async function createGame(c: AppContext) {
  const body = await c.req.json().catch(() => null);
  const parsed = parseCreateGameRequest(body);
  if (!parsed) {
    return c.json({ error: "invalid request body" }, 400);
  }

  const user = c.get("user");
  const now = Math.floor(Date.now() / 1000);
  const game = await insertGame(c.env.DB, { id: crypto.randomUUID(), ownerId: user.id, ...parsed }, now);
  return c.json(game, 201);
}

async function findGameOrNull(c: AppContext) {
  const id = c.req.param("id");
  return id ? getGameById(c.env.DB, id) : null;
}

export async function getGame(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(game);
}

export async function patchGame(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }

  const user = c.get("user");
  if (game.ownerId !== user.id && user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = parseUpdateGameRequest(body);
  if (!parsed) {
    return c.json({ error: "invalid request body" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const updated = await updateGame(c.env.DB, game.id, parsed, now);
  return c.json(updated);
}

export async function deleteGame(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }

  const user = c.get("user");
  if (game.ownerId !== user.id && user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  await softDeleteGame(c.env.DB, game.id, now);
  return c.body(null, 204);
}
