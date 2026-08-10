import { Route, Routes } from "react-router";
import { GameDetailPage } from "./routes/GameDetailPage";
import { GameFormPage } from "./routes/GameFormPage";
import { GameListPage } from "./routes/GameListPage";
import { Layout } from "./routes/Layout";
import { LoginPage } from "./routes/LoginPage";
import { RequireAuth } from "./routes/RequireAuth";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<GameListPage />} />
          <Route path="/games/new" element={<GameFormPage mode="create" />} />
          <Route path="/games/:id" element={<GameDetailPage />} />
          <Route path="/games/:id/edit" element={<GameFormPage mode="edit" />} />
        </Route>
      </Route>
    </Routes>
  );
}
