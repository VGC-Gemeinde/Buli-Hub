"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { sniffImageType } from "@/lib/image";
import {
  ownsStreamPhotoPath,
  streamPhotoPath,
  validateStreamPhoto,
} from "./photo";
import { setStreamPhotoPath, streamPhotoPathOf } from "./queries";
import { deleteStreamPhoto, uploadStreamPhoto } from "./storage";

export type StreamPhotoResult = { ok: true } | { ok: false; error: string };

// The photo shows up in the staff lists and in the stream payload; the
// player sees it on their own profile.
function revalidate(userId: string) {
  revalidatePath("/profil");
  revalidatePath("/staff/aufnahmen");
  revalidatePath("/staff/motw");
  revalidatePath(`/spieler/${userId}`);
}

// Stores a picture for the signed-in player. The bytes are whatever the crop
// dialog produced; the server checks what they actually are, not what the
// browser called them.
export async function saveStreamPhoto(file: File): Promise<StreamPhotoResult> {
  const current = await currentUser();
  if (!current) {
    return { ok: false, error: "Nicht angemeldet" };
  }
  const bytes = await file.arrayBuffer();
  const sniffed = sniffImageType(new Uint8Array(bytes.slice(0, 16)));
  const check = validateStreamPhoto({ size: bytes.byteLength, sniffed });
  if (!check.ok) {
    return check;
  }

  const previous = await streamPhotoPathOf(current.userId);
  const path = streamPhotoPath(current.userId, randomUUID());
  const stored = await uploadStreamPhoto({
    path,
    bytes,
    // The crop dialog always exports WebP; a sniffed type is what we trust.
    contentType: sniffed ?? "image/webp",
  });
  if (!stored.ok) {
    return stored;
  }
  await setStreamPhotoPath(current.userId, path);
  // Only after the row points at the new object, so a crash never leaves the
  // profile pointing at something that is gone.
  if (previous && ownsStreamPhotoPath(previous, current.userId)) {
    await deleteStreamPhoto(previous);
  }
  revalidate(current.userId);
  return { ok: true };
}

export async function removeStreamPhoto(): Promise<StreamPhotoResult> {
  const current = await currentUser();
  if (!current) {
    return { ok: false, error: "Nicht angemeldet" };
  }
  return clearPhoto(current.userId);
}

// Staff can take a photo down. It is the only handle they have if someone
// uploads something that cannot go on stream.
export async function removeStreamPhotoFor(input: {
  userId: string;
}): Promise<StreamPhotoResult> {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false, error: "Keine Berechtigung" };
  }
  return clearPhoto(input.userId);
}

async function clearPhoto(userId: string): Promise<StreamPhotoResult> {
  const path = await streamPhotoPathOf(userId);
  await setStreamPhotoPath(userId, null);
  if (path && ownsStreamPhotoPath(path, userId)) {
    await deleteStreamPhoto(path);
  }
  revalidate(userId);
  return { ok: true };
}
