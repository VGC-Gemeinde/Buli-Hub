import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Tick } from "@/components/tick";
import { MotwManager } from "@/features/motw/components/motw-manager";
import {
  buildMotwWeeks,
  initialMotwRound,
  type MotwOption,
  type MotwPlayer,
} from "@/features/motw/motw";
import {
  motwForWindow,
  type PlayerForm,
  profileFlags,
  windowPlayerForm,
} from "@/features/motw/queries";
import { holdsForWindow } from "@/features/recordings/queries";
import { windowMatchOverview } from "@/features/reporting/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentMatchday, type Identity } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { latestWindow } from "@/features/staff/queries";
import { streamPhotoUrl } from "@/features/stream-photos/photo";
import { streamPhotoPathsFor } from "@/features/stream-photos/queries";
import { germanToday } from "@/lib/german-time";

// Staff workspace for the Match of the Week: one Spieltag at a time, paged
// across the whole season. Candidates (Hauptmatch + backups) are nominated for
// the current and every later Spieltag, and one of them is confirmed as the
// Match of the Week (docs/plans/motw-candidates.md); a settled past week keeps
// its confirmation and only its VOD link stays editable.
export default async function StaffMotwPage({
  searchParams,
}: {
  searchParams: Promise<{ spieltag?: string }>;
}) {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    redirect("/");
  }

  const window = await latestWindow();
  if (!window) {
    redirect("/staff");
  }
  const matchdays = await matchdaysForWindow(window.id);
  // No schedule → no running season → nothing to nominate.
  if (matchdays.length === 0) {
    redirect("/staff");
  }

  const today = germanToday();
  const currentRound = currentMatchday(matchdays, today)?.round ?? null;
  const [selections, holds, overview, form, flags] = await Promise.all([
    motwForWindow(window.id),
    holdsForWindow(window.id),
    windowMatchOverview(window.id),
    windowPlayerForm(window.id),
    profileFlags(),
  ]);
  const photos = await streamPhotoPathsFor([
    ...new Set(
      overview.flatMap((match) => [match.playerA.userId, match.playerB.userId]),
    ),
  ]);

  const toPlayer = (identity: Identity): MotwPlayer => {
    const record: PlayerForm | undefined = form.get(identity.userId);
    const profile = flags.get(identity.userId);
    return {
      ...identity,
      streamPhotoUrl: streamPhotoUrl(photos.get(identity.userId) ?? null),
      rank: record?.rank ?? null,
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
      hasCaptureCard: profile?.hasCaptureCard ?? false,
      // No profile row at all is the same story as an untouched one.
      profileEdited: profile?.edited ?? false,
      dropped: record?.dropped ?? false,
    };
  };

  // Drop-decided matches cannot be featured — they never become options.
  const options: MotwOption[] = overview
    .filter((match) => !match.decidedByDrop)
    .map((match) => ({
      matchId: match.matchId,
      round: match.round,
      tier: match.tier,
      groupName: match.groupName,
      playerA: toPlayer(match.playerA),
      playerB: toPlayer(match.playerB),
      reported: match.outcome !== null,
    }));

  const weeks = buildMotwWeeks({
    matchdays,
    currentRound,
    selections,
    options,
    holds,
  });

  const requested = Number((await searchParams).spieltag);
  const fallback = initialMotwRound({
    totalRounds: matchdays.length,
    currentRound,
    confirmedRounds: new Set(selections.map((s) => s.round)),
    candidateRounds: new Set(
      holds.filter((h) => h.motwRole !== null).map((hold) => hold.round),
    ),
  });
  const initialRound = weeks.some((week) => week.round === requested)
    ? requested
    : fallback;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader
        breadcrumb="Match of the Week"
        breadcrumbRoot={{ href: "/staff", label: "Staff-Bereich" }}
      />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-6 py-12 sm:px-8">
        <Link
          href="/staff"
          className="mb-4.5 inline-block font-medium text-[13px] text-muted-foreground hover:text-brand-blue dark:hover:text-white"
        >
          ← Staff-Bereich
        </Link>
        <div className="flex items-center gap-3">
          <Tick size="l" />
          <h1 className="text-[30px] text-brand-blue dark:text-white">
            Match of the Week
          </h1>
        </div>
        <p className="mt-2 mb-9 max-w-[680px] text-muted-foreground text-sm">
          Ein Match pro Spieltag, ligaweit über alle Divisionen. Pro Woche
          werden ein Hauptmatch und beliebig viele Backups gewählt, alle werden
          wie Aufnahmen zurückgehalten. Welches davon das Match of the Week war,
          wird hier bestätigt. Bis dahin bewirbt die Startseite weiter das Match
          der Vorwoche. Ein vergangener Spieltag lässt sich nachtragen, solange
          er nichts Bestätigtes hat. Danach bleibt nur der VOD-Link änderbar.
        </p>
        <MotwManager
          weeks={weeks}
          currentRound={currentRound}
          initialRound={initialRound}
        />
      </main>
    </div>
  );
}
