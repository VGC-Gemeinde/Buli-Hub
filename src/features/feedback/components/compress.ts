"use client";

import { isAllowedImageType } from "@/lib/image";
import { MAX_IMAGE_EDGE, scaleToFit } from "../attachments";

// Client-side downscaling, kept deliberately thin: the arithmetic lives in
// `scaleToFit` (pure, tested), this only drives a canvas. A phone screenshot
// goes from megabytes to a few hundred KB, which on mobile data is the
// difference between an instant submit and a stalled one.

const WEBP_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden"));
    };
    image.src = url;
  });
}

/**
 * Returns a downscaled WebP copy, or the original file when shrinking it is
 * not possible or not wanted:
 *  - GIFs pass through untouched — canvas re-encoding would drop the
 *    animation, which is usually the whole point of a screen recording.
 *  - anything already within the edge limit passes through, so we never
 *    re-encode (and degrade) a small screenshot for nothing.
 *  - if the canvas produces something *larger*, the original wins.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isAllowedImageType(file.type) || file.type === "image/gif") {
    return file;
  }

  try {
    const image = await loadImage(file);
    const target = scaleToFit(
      image.naturalWidth,
      image.naturalHeight,
      MAX_IMAGE_EDGE,
    );
    if (
      target.width === image.naturalWidth &&
      target.height === image.naturalHeight &&
      file.type === "image/webp"
    ) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    context.drawImage(image, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/webp", WEBP_QUALITY);
    });
    if (!blob || blob.size >= file.size) {
      return file;
    }
    return new File([blob], "screenshot.webp", { type: "image/webp" });
  } catch {
    // Compression is an optimisation, never a gate — the server still
    // validates, and an oversized original gets a clear error there.
    return file;
  }
}
