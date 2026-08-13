import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth-context";

const REDIRECT_KEY = "postLoginRedirect";

// 未ログインで /games/:id 等を直接開いた場合、ログイン後に元のURLへ戻すための一時保存。
// Discord OAuthは別オリジンを経由するフルページ遷移になるため、React Routerのstateではなくsessionストレージを使う。
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") {
      sessionStorage.setItem(REDIRECT_KEY, location.pathname + location.search);
      navigate("/login", { replace: true });
      return;
    }
    if (status === "authenticated") {
      const target = sessionStorage.getItem(REDIRECT_KEY);
      if (target) {
        sessionStorage.removeItem(REDIRECT_KEY);
        navigate(target, { replace: true });
      }
    }
  }, [status, location.pathname, location.search, navigate]);

  if (status !== "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-600">読み込み中...</p>
      </main>
    );
  }

  return <Outlet />;
}
