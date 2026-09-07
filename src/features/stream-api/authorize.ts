import { authorizeBearer } from "@/lib/bearer";

// Gate for the stream API routes (docs/plans/stream-api.md): the one caller
// is gemeinde-streams, presenting STREAM_API_SECRET as a bearer token. The
// payload deliberately carries results the public views withhold (MotW
// embargo, spoiler protection): the caller is the stream that shows the
// match, and the route is never reached from a browser.
export function rejectUnauthorized(request: Request): Response | null {
  const auth = authorizeBearer(
    request.headers.get("authorization"),
    process.env.STREAM_API_SECRET,
  );
  if (auth === "unconfigured") {
    return Response.json(
      { error: "STREAM_API_SECRET not set" },
      { status: 503 },
    );
  }
  if (auth === "unauthorized") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export const NO_STORE = { "Cache-Control": "no-store" };
