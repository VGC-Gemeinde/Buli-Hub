import { describe, expect, it } from "vitest";
import { authorizeJob } from "./jobs";

describe("authorizeJob", () => {
  it("is unconfigured without a secret, whatever is presented", () => {
    expect(authorizeJob("Bearer x", undefined)).toBe("unconfigured");
    expect(authorizeJob(null, "")).toBe("unconfigured");
  });

  it("accepts exactly the configured bearer token", () => {
    expect(authorizeJob("Bearer s3cret", "s3cret")).toBe("ok");
    expect(authorizeJob("Bearer   s3cret", "s3cret")).toBe("ok");
  });

  it("rejects a missing, malformed or wrong header", () => {
    expect(authorizeJob(null, "s3cret")).toBe("unauthorized");
    expect(authorizeJob("s3cret", "s3cret")).toBe("unauthorized");
    expect(authorizeJob("Basic s3cret", "s3cret")).toBe("unauthorized");
    expect(authorizeJob("Bearer s3cret2", "s3cret")).toBe("unauthorized");
    expect(authorizeJob("Bearer s3cre", "s3cret")).toBe("unauthorized");
  });
});
