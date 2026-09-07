import { createHash, timingSafeEqual } from "node:crypto";

// Authorization for machine-to-machine routes with a shared secret sent as
// `Authorization: Bearer <secret>`: the scheduled job routes (Cloud
// Scheduler, JOBS_SECRET) and the stream API (gemeinde-streams,
// STREAM_API_SECRET). Fails closed without a configured secret, so a service
// that has not been set up for a caller cannot be driven from outside.

export type BearerAuthorization = "ok" | "unconfigured" | "unauthorized";

export function authorizeBearer(
  authorizationHeader: string | null,
  secret: string | undefined,
): BearerAuthorization {
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
