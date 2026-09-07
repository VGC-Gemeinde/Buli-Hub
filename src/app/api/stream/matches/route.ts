import { latestWindow } from "@/features/staff/queries";
import { seasonName } from "@/features/staff/registration-window";
import { NO_STORE, rejectUnauthorized } from "@/features/stream-api/authorize";
import { listStreamMatches } from "@/features/stream-api/queries";

// Stream API: the played matches of the current season, for the match
// picker in gemeinde-streams (docs/plans/stream-api.md).
export async function GET(request: Request) {
  const rejected = rejectUnauthorized(request);
  if (rejected) {
    return rejected;
  }
  const window = await latestWindow();
  if (!window) {
    return Response.json({ error: "no season" }, { status: 404 });
  }
  const matches = await listStreamMatches(window.id);
  return Response.json(
    {
      season: {
        number: window.seasonNumber,
        name: seasonName(window.seasonNumber),
      },
      matches,
    },
    { headers: NO_STORE },
  );
}
