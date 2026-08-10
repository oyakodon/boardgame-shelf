import { Hono } from "hono";
import { requireAuth, requireSameOrigin, type Variables } from "./auth/middleware";
import { callback, login, logout } from "./auth/routes";
import type { Bindings } from "./env";
import { me } from "./routes/me";

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

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("/auth/*", (c) => c.json({ error: "not found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
