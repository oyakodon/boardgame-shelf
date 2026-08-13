import type {
  CreateGameRequest,
  ErrorResponse,
  Game,
  GameDetail,
  GamePhoto,
  Member,
  Tag,
  UpdateGameRequest,
  User,
} from "../shared/types";

async function readErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorResponse | null;
  return body?.error ?? `request failed: ${res.status} ${res.url}`;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// credentials:"include"とエラー処理の反復をここに集約する。204(ボディ無し)は
// undefinedを返す。404→nullや401→nullのような呼び出し元固有のステータス処理は
// ここに混ぜず、各関数で個別に行う
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, credentials: "include" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export async function fetchMe(): Promise<User | null> {
  const res = await fetch("/api/me", { credentials: "include" });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

export async function listMembers(): Promise<Member[]> {
  return request<Member[]>("/api/users");
}

export async function listGames(): Promise<Game[]> {
  return request<Game[]>("/api/games");
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
  return request<Game>("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateGame(id: string, body: UpdateGameRequest): Promise<Game> {
  return request<Game>(`/api/games/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteGame(id: string): Promise<void> {
  await request<void>(`/api/games/${id}`, { method: "DELETE" });
}

export async function uploadGamePhoto(gameId: string, blob: Blob): Promise<GamePhoto> {
  const form = new FormData();
  form.set("photo", blob, "photo.jpg");
  return request<GamePhoto>(`/api/games/${gameId}/photos`, { method: "POST", body: form });
}

export async function deletePhoto(photoId: string): Promise<void> {
  await request<void>(`/api/photos/${photoId}`, { method: "DELETE" });
}

export async function listTags(): Promise<Tag[]> {
  return request<Tag[]>("/api/tags");
}

export async function addGameTag(gameId: string, name: string): Promise<Tag[]> {
  return request<Tag[]>(`/api/games/${gameId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function removeGameTag(gameId: string, tagId: string): Promise<void> {
  await request<void>(`/api/games/${gameId}/tags/${tagId}`, { method: "DELETE" });
}
