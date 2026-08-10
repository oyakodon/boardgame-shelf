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
