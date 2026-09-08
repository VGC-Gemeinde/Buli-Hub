import { describe, expect, it } from "vitest";
import {
  baseCropSize,
  clampCropView,
  cropRect,
  cropSize,
  initialCropView,
  isLowResolution,
  MAX_ZOOM,
  ownsStreamPhotoPath,
  STREAM_PHOTO,
  showStreamPhotoCard,
  streamPhotoPath,
  streamPhotoUrl,
  validateStreamPhoto,
} from "./photo";

describe("streamPhotoPath / ownsStreamPhotoPath", () => {
  it("puts every photo under its owner", () => {
    expect(streamPhotoPath("user-1", "abc")).toBe("user-1/abc.webp");
    expect(streamPhotoPath("user-1", "abc", "png")).toBe("user-1/abc.png");
    expect(ownsStreamPhotoPath("user-1/abc.webp", "user-1")).toBe(true);
  });

  it("rejects a path that belongs to someone else", () => {
    expect(ownsStreamPhotoPath("user-2/abc.webp", "user-1")).toBe(false);
    expect(ownsStreamPhotoPath("user-11/abc.webp", "user-1")).toBe(false);
    expect(ownsStreamPhotoPath("abc.webp", "user-1")).toBe(false);
  });
});

describe("streamPhotoUrl", () => {
  it("builds the public URL", () => {
    expect(streamPhotoUrl("user-1/abc.webp", "https://sb.example.com")).toBe(
      "https://sb.example.com/storage/v1/object/public/stream-photos/user-1/abc.webp",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(streamPhotoUrl("u/a.webp", "https://sb.example.com/")).toBe(
      "https://sb.example.com/storage/v1/object/public/stream-photos/u/a.webp",
    );
  });

  it("is null without a path or without a base", () => {
    expect(streamPhotoUrl(null, "https://sb.example.com")).toBeNull();
    expect(streamPhotoUrl("u/a.webp", "")).toBeNull();
  });
});

describe("showStreamPhotoCard", () => {
  const none = {
    isMotwPlayer: false,
    isRecordedPlayer: false,
    hasPhoto: false,
  };

  it("stays hidden for a player nobody is going to show", () => {
    expect(showStreamPhotoCard(none)).toBe(false);
  });

  it("appears for the Match of the Week and for a recorded match", () => {
    expect(showStreamPhotoCard({ ...none, isMotwPlayer: true })).toBe(true);
    expect(showStreamPhotoCard({ ...none, isRecordedPlayer: true })).toBe(true);
  });

  it("stays for anyone who already uploaded one", () => {
    expect(showStreamPhotoCard({ ...none, hasPhoto: true })).toBe(true);
  });
});

describe("baseCropSize", () => {
  it("takes the full height of a wide picture", () => {
    const size = baseCropSize({ width: 4000, height: 1000 });
    expect(size.height).toBe(1000);
    expect(size.width).toBeCloseTo(1000 * STREAM_PHOTO.aspect, 6);
  });

  it("takes the full width of a tall picture", () => {
    const size = baseCropSize({ width: 1000, height: 4000 });
    expect(size.width).toBe(1000);
    expect(size.height).toBeCloseTo(1000 / STREAM_PHOTO.aspect, 6);
  });

  it("is empty for an empty picture", () => {
    expect(baseCropSize({ width: 0, height: 0 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("cropSize", () => {
  const natural = { width: 1000, height: 4000 };

  it("shows less the further in you zoom", () => {
    const one = cropSize(natural, 1);
    const two = cropSize(natural, 2);
    expect(two.width).toBeCloseTo(one.width / 2, 6);
    expect(two.height).toBeCloseTo(one.height / 2, 6);
  });

  it("never zooms out past the whole picture and never past the cap", () => {
    expect(cropSize(natural, 0.2)).toEqual(cropSize(natural, 1));
    expect(cropSize(natural, 99)).toEqual(cropSize(natural, MAX_ZOOM));
  });
});

describe("clampCropView / cropRect", () => {
  const natural = { width: 2000, height: 3000 };

  it("starts centred, filling the shorter dimension", () => {
    // 2000x3000 is wider than 14:23, so the cut takes the full height and
    // sits centred horizontally.
    const rect = cropRect(natural, initialCropView(natural));
    expect(rect.y).toBeCloseTo(0, 6);
    expect(rect.height).toBeCloseTo(3000, 6);
    expect(rect.width).toBeCloseTo(3000 * STREAM_PHOTO.aspect, 6);
    expect(rect.x + rect.width / 2).toBeCloseTo(1000, 6);
  });

  it("keeps the cut inside the picture when dragged past an edge", () => {
    const rect = cropRect(natural, { zoom: 2, centerX: -500, centerY: 99999 });
    expect(rect.x).toBeCloseTo(0, 6);
    expect(rect.y + rect.height).toBeCloseTo(3000, 6);
    expect(rect.x + rect.width).toBeLessThanOrEqual(2000 + 1e-6);
  });

  it("keeps the target shape at every zoom", () => {
    for (const zoom of [1, 1.5, 2, MAX_ZOOM]) {
      const rect = cropRect(natural, { zoom, centerX: 1000, centerY: 1500 });
      expect(rect.width / rect.height).toBeCloseTo(STREAM_PHOTO.aspect, 6);
    }
  });

  it("clamps the zoom itself", () => {
    expect(
      clampCropView(natural, { zoom: 0, centerX: 0, centerY: 0 }).zoom,
    ).toBe(1);
    expect(
      clampCropView(natural, { zoom: 50, centerX: 0, centerY: 0 }).zoom,
    ).toBe(MAX_ZOOM);
  });
});

describe("isLowResolution", () => {
  it("flags a cut smaller than the overlay shows", () => {
    expect(isLowResolution({ x: 0, y: 0, width: 400, height: 657 })).toBe(true);
  });

  it("passes a cut at or above the target", () => {
    expect(
      isLowResolution({
        x: 0,
        y: 0,
        width: STREAM_PHOTO.width,
        height: STREAM_PHOTO.height,
      }),
    ).toBe(false);
  });
});

describe("validateStreamPhoto", () => {
  it("accepts a normal WebP", () => {
    expect(
      validateStreamPhoto({ size: 300_000, sniffed: "image/webp" }),
    ).toEqual({ ok: true });
  });

  it("rejects something that is not an image", () => {
    const result = validateStreamPhoto({ size: 10, sniffed: null });
    expect(result.ok).toBe(false);
  });

  it("rejects an oversized or empty file", () => {
    expect(
      validateStreamPhoto({
        size: STREAM_PHOTO.maxBytes + 1,
        sniffed: "image/webp",
      }).ok,
    ).toBe(false);
    expect(validateStreamPhoto({ size: 0, sniffed: "image/webp" }).ok).toBe(
      false,
    );
  });
});
