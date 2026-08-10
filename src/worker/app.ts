import { Hono } from "hono";
import type { Bindings } from "./env";

export const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.text("ok"));

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
