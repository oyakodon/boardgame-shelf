import { useEffect, useState } from "react";
import type { User } from "../shared/types";
import { fetchMe, logout } from "./api";

type Status = "loading" | "authenticated" | "unauthenticated";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchMe()
      .then((fetchedUser) => {
        setUser(fetchedUser);
        setStatus(fetchedUser ? "authenticated" : "unauthenticated");
      })
      .catch(() => setStatus("unauthenticated"));
  }, []);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-600">読み込み中...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <a href="/auth/login" className="rounded bg-indigo-600 px-6 py-3 text-white hover:bg-indigo-700">
          Discordでログイン
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-lg text-gray-600">ようこそ、{user.displayName}さん</p>
      <button
        type="button"
        onClick={() => {
          logout()
            .then(() => window.location.reload())
            .catch((error: unknown) => {
              console.error(error);
              window.alert("ログアウトに失敗しました。もう一度お試しください。");
            });
        }}
        className="rounded border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-100"
      >
        ログアウト
      </button>
    </main>
  );
}
