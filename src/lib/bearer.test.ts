import { describe, expect, it } from "vitest";
import { authorizeBearer } from "./bearer";

describe("authorizeBearer", () => {
  it("is unconfigured without a secret, whatever is presented", () => {
    expect(authorizeBearer("Bearer x", undefined)).toBe("unconfigured");
    expect(authorizeBearer(null, "")).toBe("unconfigured");
  });

  it("accepts exactly the configured bearer token", () => {
    expect(authorizeBearer("Bearer s3cret", "s3cret")).toBe("ok");
    expect(authorizeBearer("Bearer   s3cret", "s3cret")).toBe("ok");
  });

  it("rejects a missing, malformed or wrong header", () => {
    expect(authorizeBearer(null, "s3cret")).toBe("unauthorized");
    expect(authorizeBearer("s3cret", "s3cret")).toBe("unauthorized");
    expect(authorizeBearer("Basic s3cret", "s3cret")).toBe("unauthorized");
    expect(authorizeBearer("Bearer s3cret2", "s3cret")).toBe("unauthorized");
    expect(authorizeBearer("Bearer s3cre", "s3cret")).toBe("unauthorized");
  });
});
