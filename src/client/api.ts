import type {
  CreateGameRequest,
  ErrorResponse,
  Game,
  GameDetail,
  GamePhoto,
  UpdateGameRequest,
  User,
} from "../shared/types";

export async function fetchMe(): Promise<User | null> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`failed to fetch /api/me: ${res.status}`);
  }
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch("/auth/logout", { method: "POST", credentials: "include" });
  if (!res.ok) {
    throw new Error(`failed to logout: ${res.status}`);
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorResponse | null;
  return body?.error ?? `request failed: ${res.status}`;
}

export async function listGames(): Promise<Game[]> {
  const res = await fetch("/api/games", { credentials: "include" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function getGame(id: string): Promise<GameDetail | null> {
  const res = await fetch(`/api/games/${id}`, { credentials: "include" });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function createGame(body: CreateGameRequest): Promise<Game> {
  const res = await fetch("/api/games", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function updateGame(id: string, body: UpdateGameRequest): Promise<Game> {
  const res = await fetch(`/api/games/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function deleteGame(id: string): Promise<void> {
  const res = await fetch(`/api/games/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
}

export async function uploadGamePhoto(gameId: string, blob: Blob): Promise<GamePhoto> {
  const form = new FormData();
  form.set("photo", blob, "photo.jpg");
  const res = await fetch(`/api/games/${gameId}/photos`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function deletePhoto(photoId: string): Promise<void> {
  const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
}
