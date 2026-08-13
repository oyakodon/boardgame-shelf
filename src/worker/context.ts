import type { Context } from "hono";
import type { Variables } from "./auth/middleware";
import type { Bindings } from "./env";

export type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
