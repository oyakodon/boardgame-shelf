export type Role = "member" | "admin";

export type User = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
};

export type ErrorResponse = {
  error: string;
};

export type GameStatus = "available" | "retired";

export type Game = {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  minPlayers: number;
  maxPlayers: number | null;
  playTimeMin: number | null;
  playTimeMax: number | null;
  note: string | null;
  bggId: number | null;
  status: GameStatus;
  thumbnailUrl: string | null;
  tagNames: string[];
  createdAt: number;
  updatedAt: number;
};

export type GamePhoto = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: number;
};

export type Tag = {
  id: string;
  name: string;
};

export type GameDetail = Game & {
  photos: GamePhoto[];
  tags: Tag[];
};

export type CreateGameRequest = {
  title: string;
  minPlayers: number;
  maxPlayers?: number | null;
  playTimeMin?: number | null;
  playTimeMax?: number | null;
  note?: string | null;
  bggId?: number | null;
};

export type UpdateGameRequest = Partial<CreateGameRequest> & {
  status?: GameStatus;
};
