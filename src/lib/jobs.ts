import { createHash, timingSafeEqual } from "node:crypto";

// Authorization for scheduled job routes (Cloud Scheduler → route handler):
// a shared secret sent as `Authorization: Bearer <JOBS_SECRET>`. Fails
// closed without a configured secret, so a service that has not been set up
// for jobs cannot be driven from outside.

export type JobAuthorization = "ok" | "unconfigured" | "unauthorized";

export function authorizeJob(
  authorizationHeader: string | null,
  secret: string | undefined,
): JobAuthorization {
  if (!secret) {
    return "unconfigured";
  }
  const presented = authorizationHeader?.match(/^Bearer\s+(.+)$/)?.[1] ?? "";
  // Compare digests: equal length regardless of input, so timingSafeEqual
  // never throws and the comparison leaks nothing.
  const same = timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(secret).digest(),
  );
  return same ? "ok" : "unauthorized";
}
