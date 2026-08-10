import { Hono } from "hono";
import type { Bindings } from "./env";

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.text("ok"));

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("/auth/*", (c) => c.json({ error: "not found" }, 404));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
