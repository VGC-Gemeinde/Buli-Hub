import { latestWindow } from "@/features/staff/queries";
import { seasonName } from "@/features/staff/registration-window";
import { NO_STORE, rejectUnauthorized } from "@/features/stream-api/authorize";
import { getStreamMatch } from "@/features/stream-api/queries";

// A uuid column would turn a malformed id into a failed cast (500); a typo
// in the URL is a 404.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stream API: one played match of the current season with team sheets and
// avatars, fetched when the operator picks it (docs/plans/stream-api.md).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const rejected = rejectUnauthorized(request);
  if (rejected) {
    return rejected;
  }
  const { matchId } = await params;
  const window = await latestWindow();
  if (!window || !UUID.test(matchId)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const match = await getStreamMatch(window.id, matchId);
  if (!match) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(
    {
      season: {
        number: window.seasonNumber,
        name: seasonName(window.seasonNumber),
      },
      match,
    },
    { headers: NO_STORE },
  );
}
