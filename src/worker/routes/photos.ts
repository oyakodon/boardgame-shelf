import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_GAME } from "../../shared/constants";
import { countPhotosByGameId, deletePhotoById, getPhotoWithGameOwner, insertGamePhoto } from "../db";
import type { AppContext } from "./games";
import { canEditGame, findGameOrNull } from "./games";

const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff];

async function isJpeg(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, JPEG_MAGIC_BYTES.length).arrayBuffer());
  return JPEG_MAGIC_BYTES.every((byte, i) => head[i] === byte);
}

export async function uploadGamePhoto(c: AppContext) {
  const game = await findGameOrNull(c);
  if (!game) {
    return c.json({ error: "not found" }, 404);
  }

  const user = c.get("user");
  if (!canEditGame(game, user)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const count = await countPhotosByGameId(c.env.DB, game.id);
  if (count >= MAX_PHOTOS_PER_GAME) {
    return c.json({ error: `写真は${MAX_PHOTOS_PER_GAME}枚までです` }, 400);
  }

  const formData = await c.req.formData().catch(() => null);
  const file = formData?.get("photo");
  if (!(file instanceof Blob) || file.size === 0) {
    return c.json({ error: "invalid request body" }, 400);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return c.json({ error: `写真は${MAX_PHOTO_BYTES / 1024 / 1024}MBまでです` }, 400);
  }
  if (file.type !== "image/jpeg" || !(await isJpeg(file))) {
    return c.json({ error: "JPEG形式の写真のみアップロードできます" }, 400);
  }

  const id = crypto.randomUUID();
  const r2Key = `games/${game.id}/${id}.jpg`;
  await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: "image/jpeg" },
  });

  const now = Math.floor(Date.now() / 1000);
  const photo = await insertGamePhoto(
    c.env.DB,
    {
      id,
      gameId: game.id,
      r2Key,
      contentType: "image/jpeg",
      sizeBytes: file.size,
    },
    now,
  );
  return c.json(photo, 201);
}

export async function deletePhoto(c: AppContext) {
  const id = c.req.param("id");
  const photo = id ? await getPhotoWithGameOwner(c.env.DB, id) : null;
  if (!photo) {
    return c.json({ error: "not found" }, 404);
  }

  const user = c.get("user");
  if (!canEditGame({ ownerId: photo.gameOwnerId, registeredById: photo.gameRegisteredById }, user)) {
    return c.json({ error: "forbidden" }, 403);
  }

  await c.env.BUCKET.delete(photo.r2Key);
  await deletePhotoById(c.env.DB, photo.id);
  return c.body(null, 204);
}
