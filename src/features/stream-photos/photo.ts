// The picture a player picks for the stream overlay (docs/plans/
// stream-photos.md). Pure logic: the target geometry, the object path, the
// public URL, the crop arithmetic behind the dialog, and who is shown the
// upload at all.
//
// This has nothing to do with the Discord avatar. The avatar is what the hub
// shows on its own pages; the stream photo is what the stream shows. Neither
// one ever stands in for the other.

// The overlay (../gemeinde-streams, team-detail-online) draws the photo into
// a 420x690 box with object-fit: cover. We export twice that, so a stream
// scaled above 1080p still looks sharp.
export const STREAM_PHOTO = {
  width: 840,
  height: 1380,
  // 420 / 690, the shape of the overlay's photo area.
  aspect: 420 / 690,
  maxBytes: 2 * 1024 * 1024,
} as const;

export const STREAM_PHOTO_BUCKET = "stream-photos";

// One object per upload: the URL is what the stream and its CDN cache, so a
// stable path would keep serving the previous picture after a change. The
// extension follows the bytes: the crop dialog always produces WebP, the dev
// seed paints a PNG.
export function streamPhotoPath(
  userId: string,
  id: string,
  extension: "webp" | "png" | "jpg" = "webp",
): string {
  return `${userId}/${id}.${extension}`;
}

// A stored path belongs to its owner. The delete side checks this, so a
// tampered row can never make the server remove someone else's object.
export function ownsStreamPhotoPath(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`);
}

// The public URL of a stored photo. The bucket is public because the overlay
// loads it in a browser that has no session.
export function streamPhotoUrl(
  path: string | null,
  baseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!path || !baseUrl) {
    return null;
  }
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${STREAM_PHOTO_BUCKET}/${path}`;
}

// Who gets the upload card in /profil: the two players of the Match of the
// Week and the players of a match marked for a recording. Everyone else is
// never asked for a picture of themselves. A player who already has one
// keeps the card for good, so a photo can always be replaced or deleted.
export function showStreamPhotoCard(input: {
  isMotwPlayer: boolean;
  isRecordedPlayer: boolean;
  hasPhoto: boolean;
}): boolean {
  return input.isMotwPlayer || input.isRecordedPlayer || input.hasPhoto;
}

// --- Crop arithmetic ------------------------------------------------------

export type Size = { width: number; height: number };

// What the dialog holds while the player drags: how far in they zoomed, and
// where the centre of the visible cut sits, in source pixels.
export type CropView = { zoom: number; centerX: number; centerY: number };

export const MAX_ZOOM = 4;

// The largest cut in the target shape that still fits the image. Zoom 1 shows
// exactly this, so the whole width (or height) of the picture is in frame.
export function baseCropSize(natural: Size): Size {
  const { width, height } = natural;
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  if (width / height > STREAM_PHOTO.aspect) {
    return { width: height * STREAM_PHOTO.aspect, height };
  }
  return { width, height: width / STREAM_PHOTO.aspect };
}

// The cut at this zoom. Zooming in shows less of the source, never more, so
// zoom below 1 is pinned to 1.
export function cropSize(natural: Size, zoom: number): Size {
  const base = baseCropSize(natural);
  const factor = Math.min(Math.max(zoom, 1), MAX_ZOOM);
  return { width: base.width / factor, height: base.height / factor };
}

// The starting view: the whole image in frame, centred.
export function initialCropView(natural: Size): CropView {
  return {
    zoom: 1,
    centerX: natural.width / 2,
    centerY: natural.height / 2,
  };
}

// Keeps the cut inside the picture. Dragging stops at the edges instead of
// pulling empty space into the frame.
export function clampCropView(natural: Size, view: CropView): CropView {
  const size = cropSize(natural, view.zoom);
  const halfW = size.width / 2;
  const halfH = size.height / 2;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);
  return {
    zoom: Math.min(Math.max(view.zoom, 1), MAX_ZOOM),
    centerX: clamp(view.centerX, halfW, natural.width - halfW),
    centerY: clamp(view.centerY, halfH, natural.height - halfH),
  };
}

export type CropRect = { x: number; y: number; width: number; height: number };

// The source rectangle to draw from, ready for drawImage.
export function cropRect(natural: Size, view: CropView): CropRect {
  const clamped = clampCropView(natural, view);
  const size = cropSize(natural, clamped.zoom);
  return {
    x: clamped.centerX - size.width / 2,
    y: clamped.centerY - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

// Whether the chosen cut has fewer pixels than the overlay shows, so the
// dialog can say the picture will look soft rather than letting the player
// find out on stream.
export function isLowResolution(rect: CropRect): boolean {
  return rect.width < STREAM_PHOTO.width || rect.height < STREAM_PHOTO.height;
}

// The upload gate the action applies, on the bytes it actually received.
export type PhotoValidation = { ok: true } | { ok: false; error: string };

export function validateStreamPhoto(input: {
  size: number;
  sniffed: string | null;
}): PhotoValidation {
  if (input.sniffed === null) {
    return {
      ok: false,
      error:
        "Das ist kein Bild, das wir lesen können. Nimm PNG, JPEG oder WebP.",
    };
  }
  if (input.size > STREAM_PHOTO.maxBytes) {
    return {
      ok: false,
      error: `Das Bild ist zu groß. Maximal ${Math.round(STREAM_PHOTO.maxBytes / (1024 * 1024))} MB.`,
    };
  }
  if (input.size === 0) {
    return { ok: false, error: "Die Datei ist leer." };
  }
  return { ok: true };
}
