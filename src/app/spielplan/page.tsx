import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { FullSchedule } from "@/features/public-league/components/full-schedule";
import { publicLeagueOverview } from "@/features/public-league/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentSeason } from "@/features/season/season-status";
import {
  parseSpoilersOff,
  SPOILERS_OFF_COOKIE,
} from "@/features/spoilers/spoilers";
import { germanToday } from "@/lib/german-time";

// The complete Spielplan, one page for everyone. Public while the season runs;
// during schedule_hidden it is the staff preview (non-staff 404); before a
// schedule exists the page does not exist (docs/plans/full-schedule-page.md).
export default async function SpielplanPage() {
  const [{ window, phase }, current] = await Promise.all([
    currentSeason(),
    currentUser(),
  ]);
  const isStaff = current !== null && roleAtLeast(current.role, "staff");
  const visible =
    phase === "regular_season" || (phase === "schedule_hidden" && isStaff);
  if (!window || !visible) {
    notFound();
  }

  const [overview, cookieStore] = await Promise.all([
    publicLeagueOverview(window.id, window.seasonNumber, germanToday(), {
      userId: current?.userId ?? null,
      isStaff,
    }),
    cookies(),
  ]);
  const spoilersOff = parseSpoilersOff(
    cookieStore.get(SPOILERS_OFF_COOKIE)?.value,
  );

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader
        breadcrumb="Spielplan"
        breadcrumbRoot={{ href: "/", label: "Übersicht" }}
      />
      <FullSchedule
        overview={overview}
        meId={current?.userId ?? ""}
        initialSpoilersOff={spoilersOff}
        hiddenPreview={phase === "schedule_hidden"}
      />
    </div>
  );
}
