import { describe, expect, it } from "vitest";
import { isAllowedImageType, sniffImageType } from "./image";

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

describe("sniffImageType", () => {
  it("identifies each allowed format from its magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF)).toBe("image/gif");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("rejects a non-image, however it is labelled", () => {
    // ELF header — an executable renamed to .png must not pass.
    expect(
      sniffImageType(bytes(0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01)),
    ).toBeNull();
    // A PDF.
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBeNull();
    // Plain text.
    expect(sniffImageType(bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f))).toBeNull();
  });

  it("rejects truncated buffers instead of guessing", () => {
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
    // RIFF without the WEBP marker is some other RIFF container (e.g. WAV).
    expect(
      sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00)),
    ).toBeNull();
    expect(
      sniffImageType(
        bytes(
          0x52,
          0x49,
          0x46,
          0x46,
          0x24,
          0x00,
          0x00,
          0x00,
          0x57,
          0x41,
          0x56,
          0x45,
        ),
      ),
    ).toBeNull();
  });
});

describe("isAllowedImageType", () => {
  it("accepts the four supported types and nothing else", () => {
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("image/gif")).toBe(true);
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
    expect(isAllowedImageType("application/pdf")).toBe(false);
    expect(isAllowedImageType("")).toBe(false);
  });
});

describe("isAllowedImageType", () => {
  it("accepts the four supported types and nothing else", () => {
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
    expect(isAllowedImageType("image/gif")).toBe(true);
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
    expect(isAllowedImageType("application/pdf")).toBe(false);
    expect(isAllowedImageType("")).toBe(false);
  });
});
