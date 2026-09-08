import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { streamPhotoPath } from "@/features/stream-photos/photo";
import { setStreamPhotoPath } from "@/features/stream-photos/queries";
import { uploadStreamPhoto } from "@/features/stream-photos/storage";

// Seeded stream photos. The bucket needs real bytes behind the path, so the
// seed paints a plain PNG in the overlay's proportions rather than shipping
// a fixture image: a solid colour is enough to see that the marks, the
// preview and the stream payload carry a picture.
//
// Local only. Re-seeding leaves the previous objects in the bucket; the local
// stack is disposable, so nothing cleans them up.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = -1;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A solid truecolour PNG. Small enough to build in memory per seed run.
function solidPng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const COLORS: [number, number, number][] = [
  [2, 31, 102], // falinks-blue
  [255, 123, 0], // pawmo-orange
  [61, 90, 128],
];

/** Gives the players a seeded stream photo, in order of the palette. */
export async function seedStreamPhotos(userIds: string[]): Promise<void> {
  for (const [index, userId] of userIds.entries()) {
    const png = solidPng(420, 690, COLORS[index % COLORS.length]);
    const path = streamPhotoPath(userId, randomUUID(), "png");
    const stored = await uploadStreamPhoto({
      path,
      bytes: png.buffer.slice(
        png.byteOffset,
        png.byteOffset + png.byteLength,
      ) as ArrayBuffer,
      contentType: "image/png",
    });
    if (stored.ok) {
      await setStreamPhotoPath(userId, path);
    }
  }
}
