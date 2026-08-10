import { Link, Outlet } from "react-router";
import { logout } from "../api";
import { useAuth } from "../auth-context";

export function Layout() {
  const { user, refresh } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900">
          さーばるボドゲ部
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-gray-600 sm:inline">{user?.displayName}</span>
          <button
            type="button"
            onClick={() => {
              logout()
                .then(refresh)
                .catch((error: unknown) => {
                  console.error(error);
                  window.alert("ログアウトに失敗しました。もう一度お試しください。");
                });
            }}
            className="min-h-11 rounded border border-gray-300 px-3 text-sm text-gray-600 active:bg-gray-100"
          >
            ログアウト
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
