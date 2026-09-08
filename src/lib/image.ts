// Image identification, shared by every feature that accepts an upload: the
// feedback screenshots and the stream photos. Pure, no canvas, no fetch.

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Identifies an image from its magic bytes, or null if it is not one of the
 * allowed formats. The server trusts this over the client-declared type: the
 * declared type is just a string the browser sent, and what we do with the
 * bytes afterwards (hand them to Discord, serve them from a public bucket)
 * must not depend on that claim.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // "GIF87a" / "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "image/gif";
  }
  // "RIFF" .... "WEBP" — the size field sits between the two markers.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
}
