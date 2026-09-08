import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { profiles } from "@/db/schema";
import { db } from "@/lib/db";

// The upload gate: who may write a photo, what the server accepts, and that
// replacing one takes the previous object with it.

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/features/roles/guard", () => ({ currentUser: currentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { uploadMock, deleteMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock("./storage", () => ({
  uploadStreamPhoto: uploadMock,
  deleteStreamPhoto: deleteMock,
}));

const { removeStreamPhoto, removeStreamPhotoFor, saveStreamPhoto } =
  await import("./actions");
const { streamPhotoPathOf } = await import("./queries");

const player = randomUUID();
const other = randomUUID();
const staff = randomUUID();

// A one-pixel WebP: "RIFF" .... "WEBP", which is what the sniffer keys on.
function webpFile(bytes = 64): File {
  const data = new Uint8Array(bytes);
  data.set([0x52, 0x49, 0x46, 0x46], 0);
  data.set([0x57, 0x45, 0x42, 0x50], 8);
  return new File([data], "photo.webp", { type: "image/webp" });
}

function signedIn(userId: string, role: "player" | "staff") {
  currentUserMock.mockResolvedValue({
    userId,
    discordId: "1",
    role,
    displayName: "Wer",
    username: "wer",
    avatarUrl: null,
  });
}

beforeAll(async () => {
  for (const id of [player, other, staff]) {
    await db.execute(sql`insert into auth.users (id) values (${id})`);
  }
  await db
    .insert(profiles)
    .values([
      { userId: player },
      { userId: other },
      { userId: staff, role: "staff" },
    ]);
});

beforeEach(() => {
  uploadMock.mockReset();
  deleteMock.mockReset();
  // The default: storage accepts the object. A single test overrides it.
  uploadMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  // Scoped to this file's own users: an unqualified UPDATE would clear the
  // column for every profile in the local database, including a seeded
  // season and whatever another test file is asserting in parallel.
  await db.execute(
    sql`update profiles set stream_photo_path = null where user_id in (${player}, ${other}, ${staff})`,
  );
});

afterAll(async () => {
  for (const id of [player, other, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("saveStreamPhoto", () => {
  it("stores the photo under its owner", async () => {
    signedIn(player, "player");
    expect(await saveStreamPhoto(webpFile())).toEqual({ ok: true });

    const path = await streamPhotoPathOf(player);
    expect(path).toMatch(new RegExp(`^${player}/.+\\.webp$`));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ path, contentType: "image/webp" }),
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("deletes the previous object when a photo is replaced", async () => {
    signedIn(player, "player");
    await saveStreamPhoto(webpFile());
    const first = await streamPhotoPathOf(player);
    await saveStreamPhoto(webpFile());
    const second = await streamPhotoPathOf(player);

    expect(second).not.toBe(first);
    expect(deleteMock).toHaveBeenCalledWith(first);
  });

  it("refuses something that is not an image", async () => {
    signedIn(player, "player");
    const result = await saveStreamPhoto(
      new File([new Uint8Array([1, 2, 3, 4])], "x.webp", {
        type: "image/webp",
      }),
    );
    expect(result.ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(await streamPhotoPathOf(player)).toBeNull();
  });

  it("refuses a file over the size cap", async () => {
    signedIn(player, "player");
    const result = await saveStreamPhoto(webpFile(2 * 1024 * 1024 + 1));
    expect(result.ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("keeps the row untouched when the upload fails", async () => {
    signedIn(player, "player");
    uploadMock.mockResolvedValue({ ok: false, error: "kaputt" });
    const result = await saveStreamPhoto(webpFile());
    expect(result).toEqual({ ok: false, error: "kaputt" });
    expect(await streamPhotoPathOf(player)).toBeNull();
  });

  it("needs a signed-in user", async () => {
    currentUserMock.mockResolvedValue(null);
    expect((await saveStreamPhoto(webpFile())).ok).toBe(false);
  });
});

describe("removeStreamPhoto", () => {
  it("clears the row and the object", async () => {
    signedIn(player, "player");
    await saveStreamPhoto(webpFile());
    const path = await streamPhotoPathOf(player);

    expect(await removeStreamPhoto()).toEqual({ ok: true });
    expect(await streamPhotoPathOf(player)).toBeNull();
    expect(deleteMock).toHaveBeenCalledWith(path);
  });
});

describe("removeStreamPhotoFor", () => {
  it("lets staff take someone's photo down", async () => {
    signedIn(other, "player");
    await saveStreamPhoto(webpFile());
    expect(await streamPhotoPathOf(other)).not.toBeNull();

    signedIn(staff, "staff");
    expect(await removeStreamPhotoFor({ userId: other })).toEqual({ ok: true });
    expect(await streamPhotoPathOf(other)).toBeNull();
  });

  it("is closed to players", async () => {
    signedIn(other, "player");
    await saveStreamPhoto(webpFile());
    signedIn(player, "player");
    expect((await removeStreamPhotoFor({ userId: other })).ok).toBe(false);
    expect(await streamPhotoPathOf(other)).not.toBeNull();
  });
});
