import type { AppContext } from "../context";

const IMG_PREFIX = "/img/";

export async function serveImage(c: AppContext) {
  const key = c.req.path.slice(IMG_PREFIX.length);
  if (!key) {
    return c.json({ error: "not found" }, 404);
  }

  const object = await c.env.BUCKET.get(key);
  if (!object) {
    return c.json({ error: "not found" }, 404);
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
