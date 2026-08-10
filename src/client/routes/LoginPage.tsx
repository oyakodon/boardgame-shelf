import { Navigate } from "react-router";
import { useAuth } from "../auth-context";

export function LoginPage() {
  const { status } = useAuth();

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <a href="/auth/login" className="min-h-12 rounded bg-indigo-600 px-6 py-3 text-white active:bg-indigo-700">
        Discordでログイン
      </a>
    </main>
  );
}
