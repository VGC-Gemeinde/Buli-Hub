import { describe, expect, it } from "vitest";
import {
  attachmentFileName,
  attachmentOutcome,
  MAX_ATTACHMENTS,
  MAX_IMAGE_EDGE,
  MAX_TOTAL_BYTES,
  scaleToFit,
  validateAttachments,
} from "./attachments";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0x24,
  0x00,
  0x00,
  0x00,
  0x57,
  0x45,
  0x42,
  0x50,
);

describe("validateAttachments", () => {
  const small = { size: 1000, type: "image/png" };

  it("accepts nothing attached", () => {
    expect(validateAttachments([]).ok).toBe(true);
  });

  it("accepts up to the count limit and rejects one more", () => {
    expect(validateAttachments(Array(MAX_ATTACHMENTS).fill(small)).ok).toBe(
      true,
    );
    const tooMany = validateAttachments(Array(MAX_ATTACHMENTS + 1).fill(small));
    expect(tooMany.ok).toBe(false);
  });

  it("accepts exactly the size limit and rejects one byte more", () => {
    expect(
      validateAttachments([{ size: MAX_TOTAL_BYTES, type: "image/png" }]).ok,
    ).toBe(true);
    expect(
      validateAttachments([{ size: MAX_TOTAL_BYTES + 1, type: "image/png" }])
        .ok,
    ).toBe(false);
  });

  it("sums sizes across files rather than checking each", () => {
    const half = { size: MAX_TOTAL_BYTES / 2 + 1, type: "image/png" };
    expect(validateAttachments([half]).ok).toBe(true);
    expect(validateAttachments([half, half]).ok).toBe(false);
  });

  it("rejects a disallowed type", () => {
    const result = validateAttachments([{ size: 10, type: "application/pdf" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Nur Bilder");
    }
  });
});

describe("attachmentFileName", () => {
  it("is 1-based and carries the format's extension", () => {
    expect(attachmentFileName(0, "image/png")).toBe("screenshot-1.png");
    expect(attachmentFileName(1, "image/jpeg")).toBe("screenshot-2.jpg");
    expect(attachmentFileName(2, "image/webp")).toBe("screenshot-3.webp");
    expect(attachmentFileName(0, "image/gif")).toBe("screenshot-1.gif");
  });
});

describe("scaleToFit", () => {
  it("leaves an already-small image alone and never upscales", () => {
    expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaleToFit(MAX_IMAGE_EDGE, 100)).toEqual({
      width: MAX_IMAGE_EDGE,
      height: 100,
    });
  });

  it("shrinks the longest edge to the limit, keeping the ratio", () => {
    expect(scaleToFit(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(scaleToFit(1600, 3200)).toEqual({ width: 800, height: 1600 });
    expect(scaleToFit(4000, 4000)).toEqual({ width: 1600, height: 1600 });
  });

  it("keeps an extreme aspect ratio at least one pixel tall", () => {
    const { width, height } = scaleToFit(20000, 5);
    expect(width).toBe(MAX_IMAGE_EDGE);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("does not divide by zero on a degenerate size", () => {
    expect(scaleToFit(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("attachmentOutcome", () => {
  it("says nothing when there were no attachments", () => {
    expect(attachmentOutcome(0, true)).toBeNull();
    expect(attachmentOutcome(0, false)).toBeNull();
  });

  it("confirms what was attached, singular and plural", () => {
    expect(attachmentOutcome(1, true)).toBe("1 Screenshot angehängt.");
    expect(attachmentOutcome(2, true)).toBe("2 Screenshots angehängt.");
  });

  it("admits the loss when the post failed", () => {
    expect(attachmentOutcome(2, false)).toContain("konnten nicht angehängt");
  });
});
