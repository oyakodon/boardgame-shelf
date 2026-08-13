import type { AppContext } from "../context";

export function me(c: AppContext) {
  return c.json(c.get("user"));
}
