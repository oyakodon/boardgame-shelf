import type { User } from "../shared/types";

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
