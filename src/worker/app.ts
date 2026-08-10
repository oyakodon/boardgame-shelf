import { Hono } from "hono";
import { requireAuth, requireSameOrigin, type Variables } from "./auth/middleware";
import { callback, login, logout } from "./auth/routes";
import type { Bindings } from "./env";
import { createGame, deleteGame, getGame, listGames, patchGame } from "./routes/games";
import { serveImage } from "./routes/img";
import { me } from "./routes/me";
import { deletePhoto, uploadGamePhoto } from "./routes/photos";
import { addTagToGame, listTags, removeTagFromGame } from "./routes/tags";

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

app.get("/api/health", (c) => c.text("ok"));

app.get("/auth/login", login);
app.get("/auth/callback", callback);
app.post("/auth/logout", requireAuth, requireSameOrigin, logout);

app.get("/api/me", requireAuth, me);

app.get("/api/games", requireAuth, listGames);
app.post("/api/games", requireAuth, requireSameOrigin, createGame);
app.get("/api/games/:id", requireAuth, getGame);
app.patch("/api/games/:id", requireAuth, requireSameOrigin, patchGame);
app.delete("/api/games/:id", requireAuth, requireSameOrigin, deleteGame);

app.post("/api/games/:id/photos", requireAuth, requireSameOrigin, uploadGamePhoto);
app.delete("/api/photos/:id", requireAuth, requireSameOrigin, deletePhoto);

app.get("/api/tags", requireAuth, listTags);
app.post("/api/games/:id/tags", requireAuth, requireSameOrigin, addTagToGame);
app.delete("/api/games/:id/tags/:tagId", requireAuth, requireSameOrigin, removeTagFromGame);

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("/auth/*", (c) => c.json({ error: "not found" }, 404));

app.get("/img/*", serveImage);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
