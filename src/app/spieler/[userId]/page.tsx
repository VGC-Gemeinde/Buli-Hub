import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { EmptyStateCard } from "@/components/empty-state-card";
import { SiteHeader } from "@/components/site-header";
import { Tick } from "@/components/tick";
import { ProfileStaffPanel } from "@/features/drops/components/profile-staff-panel";
import {
  droppedIdsForWindow,
  placementDropState,
} from "@/features/drops/queries";
import { motwForWindow } from "@/features/motw/queries";
import { ProfileSpielplan } from "@/features/player-profile/components/profile-schedule";
import { profileScheduleRows } from "@/features/player-profile/profile";
import { profileIdentity } from "@/features/player-profile/queries";
import { ProfileHeader } from "@/features/profile/components/profile-header";
import { holdsForWindow } from "@/features/recordings/queries";
import { ProfileCancelPanel } from "@/features/registration/components/profile-cancel-panel";
import { getRegistration } from "@/features/registration/queries";
import { groupResults, subDivisionResults } from "@/features/reporting/queries";
import { computeStandings } from "@/features/reporting/standings";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast, roleLabel } from "@/features/roles/roles";
import { buildPlayerMatches } from "@/features/season/dashboard";
import {
  groupRoster,
  matchdaysForWindow,
  playerPlacement,
  subDivisionMatches,
} from "@/features/season/queries";
import { subDivisionName } from "@/features/seeding/seeding";
import {
  parseSpoilersOff,
  SPOILERS_OFF_COOKIE,
} from "@/features/spoilers/spoilers";
import { latestWindow, windowSeasonPhase } from "@/features/staff/queries";
import { seasonName } from "@/features/staff/registration-window";
import { streamPhotoUrl } from "@/features/stream-photos/photo";
import { streamPhotoPathOf } from "@/features/stream-photos/queries";

// The public player profile: the identity block known from the edit page,
// the current division + place, and the spoiler-protected Spielplan
// (docs/plans/player-profile.md). Public — no auth; unknown ids 404.
export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const identity = await profileIdentity(userId);
  if (!identity) {
    notFound();
  }

  const [current, cookieStore, window] = await Promise.all([
    currentUser(),
    cookies(),
    latestWindow(),
  ]);
  const spoilersOff = parseSpoilersOff(
    cookieStore.get(SPOILERS_OFF_COOKIE)?.value,
  );
  const placement = window ? await playerPlacement(window.id, userId) : null;

  // The season block (group, rank, Spielplan) is public only once the pairings
  // are published; staff see it earlier for internal review
  // (docs/plans/schedule-publish.md).
  const isStaff = current !== null && roleAtLeast(current.role, "staff");
  const scheduleVisible =
    window !== null && (window.schedulePublishedAt !== null || isStaff);

  // The season block: group + rank from the (drop-aware) standings, plus the
  // schedule rows. Placed without a schedule yet → empty rows, handled below.
  let season: {
    line: string;
    dropped: boolean;
    rows: ReturnType<typeof profileScheduleRows>;
  } | null = null;
  if (window && placement && scheduleVisible) {
    const [
      roster,
      results,
      matches,
      resultByMatchId,
      matchdays,
      motwSelections,
      holds,
      droppedIds,
    ] = await Promise.all([
      groupRoster(placement.subDivisionId),
      groupResults(placement.subDivisionId),
      subDivisionMatches(placement.subDivisionId),
      subDivisionResults(placement.subDivisionId),
      matchdaysForWindow(window.id),
      motwForWindow(window.id),
      holdsForWindow(window.id),
      droppedIdsForWindow(window.id),
    ]);
    const rank =
      computeStandings({ roster, results }).find((row) => row.userId === userId)
        ?.rank ?? null;
    const rows = profileScheduleRows({
      playerId: userId,
      viewerId: current?.userId ?? null,
      viewerIsStaff: isStaff,
      matches: buildPlayerMatches({
        matches,
        matchdaysByRound: new Map(matchdays.map((d) => [d.round, d])),
        rosterById: new Map(roster.map((m) => [m.userId, m])),
        userId,
      }),
      resultByMatchId,
      motwSelections,
      heldMatchIds: new Set(holds.map((h) => h.matchId)),
    });
    const groupName = subDivisionName(placement.tier, placement.position);
    season = {
      line: `${groupName}${rank !== null ? ` · Platz ${rank}` : ""} · ${seasonName(window.seasonNumber)}`,
      dropped: droppedIds.has(userId),
      rows,
    };
  }

  // Staff panel, only for staff and only when there is something to act on:
  // between Anmeldeschluss and finalized seeding a registration can be
  // cancelled; a placed player can be dropped / un-dropped.
  const phase =
    isStaff && window ? (await windowSeasonPhase(window)).phase : null;
  const canCancel =
    phase === "registration_closed" &&
    window !== null &&
    (await getRegistration(window.id, userId)) !== null;
  const dropState =
    isStaff && window && placement && !canCancel
      ? await placementDropState(window.id, userId)
      : null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader
        breadcrumb="Spieler-Profil"
        breadcrumbRoot={{ href: "/", label: "Übersicht" }}
      />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-12 sm:px-8">
        <ProfileHeader
          displayName={identity.displayName}
          username={identity.username}
          avatarUrl={identity.avatarUrl}
          roleLabel={roleLabel(identity.role)}
        />

        {season ? (
          <div className="mt-10 flex flex-col gap-8">
            <div className="flex flex-wrap items-center gap-2.5">
              <Tick size="s" />
              <span className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.12em]">
                {season.line}
              </span>
              {season.dropped ? (
                <span
                  title="Spieler wurde gedroppt, alle Matches zählen als Freewin für die Gegner"
                  className="rounded-full border border-destructive/40 bg-destructive/8 px-[7px] py-[2px] font-bold text-[10.5px] text-destructive uppercase tracking-[0.06em]"
                >
                  Drop
                </span>
              ) : null}
            </div>
            <ProfileSpielplan
              rows={season.rows}
              initialSpoilersOff={spoilersOff}
            />
          </div>
        ) : (
          <div className="mt-10">
            <EmptyStateCard title="Nicht in der laufenden Saison" informational>
              Für diese Saison liegt keine Einteilung vor. Sobald{" "}
              {identity.name} in einer Division spielt, erscheinen hier Gruppe,
              Platzierung und Spielplan.
            </EmptyStateCard>
          </div>
        )}

        {canCancel && window ? (
          <ProfileCancelPanel
            player={{ userId, name: identity.name }}
            seasonName={seasonName(window.seasonNumber)}
          />
        ) : dropState && window && placement ? (
          <ProfileStaffPanel
            player={{
              userId,
              name: identity.name,
              groupName: subDivisionName(placement.tier, placement.position),
            }}
            dropped={dropState.droppedAt !== null}
            dropReason={dropState.dropReason}
            streamPhotoUrl={streamPhotoUrl(await streamPhotoPathOf(userId))}
          />
        ) : null}
      </main>
    </div>
  );
}
