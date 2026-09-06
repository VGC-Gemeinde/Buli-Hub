import { syncSeasonDiscord } from "@/features/discord-season/converge";
import { latestWindow } from "@/features/staff/queries";
import { authorizeJob } from "@/lib/jobs";

// Cloud Scheduler target: converges the Discord server onto the running
// season (docs/plans/discord-season-setup.md). Idempotent, so overlapping
// or repeated invocations are harmless. Nothing to do before the schedule
// is published — roles would leak the hidden groups.
export async function POST(request: Request) {
  const auth = authorizeJob(
    request.headers.get("authorization"),
    process.env.JOBS_SECRET,
  );
  if (auth === "unconfigured") {
    return Response.json({ error: "JOBS_SECRET not set" }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const window = await latestWindow();
  if (!window || window.schedulePublishedAt === null) {
    return Response.json({ skipped: "no published schedule" });
  }
  const report = await syncSeasonDiscord(window.id);
  if (report === null) {
    return Response.json({ skipped: "not configured" });
  }
  return Response.json(report);
}
