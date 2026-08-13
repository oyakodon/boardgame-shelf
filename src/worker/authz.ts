export { canEditGame } from "../shared/authz";

import type { AppContext } from "./context";
import { getGameById } from "./db";

export async function findGameOrNull(c: AppContext) {
  const id = c.req.param("id");
  return id ? getGameById(c.env.DB, id) : null;
}
