import type { Context } from "hono";
import type { Variables } from "../auth/middleware";
import type { Bindings } from "../env";

export function me(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  return c.json(c.get("user"));
}
