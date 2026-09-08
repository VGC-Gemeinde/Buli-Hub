import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { STREAM_PHOTO_BUCKET } from "./photo";

// The bucket side of the stream photos. Writes go through the service key,
// never from a browser; reads are plain public URLs (`streamPhotoUrl`).

export type StorageResult = { ok: true } | { ok: false; error: string };

export async function uploadStreamPhoto(input: {
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
}): Promise<StorageResult> {
  const admin = supabaseAdmin();
  if (!admin.ok) {
    return { ok: false, error: "Bild-Speicher ist nicht konfiguriert" };
  }
  const { error } = await admin.client.storage
    .from(STREAM_PHOTO_BUCKET)
    .upload(input.path, input.bytes, {
      contentType: input.contentType,
      // A fresh path per upload, so nothing is ever overwritten in place.
      upsert: false,
      cacheControl: "31536000",
    });
  if (error) {
    console.error("[stream-photos] upload failed", error);
    return {
      ok: false,
      error: "Das Bild konnte nicht gespeichert werden. Versuch es nochmal.",
    };
  }
  return { ok: true };
}

// Best effort: the row already points somewhere else, so a leftover object
// is wasted space and nothing worse.
export async function deleteStreamPhoto(path: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin.ok) {
    return;
  }
  const { error } = await admin.client.storage
    .from(STREAM_PHOTO_BUCKET)
    .remove([path]);
  if (error) {
    console.error("[stream-photos] delete failed", error);
  }
}
