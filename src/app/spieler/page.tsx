import { redirect } from "next/navigation";
import type { RegisteredPlayer } from "@/components/player-grid";
import { SiteHeader } from "@/components/site-header";
import { markDropped } from "@/features/drops/drops";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { SeasonGates } from "@/features/membership/components/season-gates";
import { motwForWindow } from "@/features/motw/queries";
import { getProfile } from "@/features/profile/queries";
import { holdsForWindow } from "@/features/recordings/queries";
import { ProfileHint } from "@/features/registration/components/profile-hint";
import { RegistrationConfirmation } from "@/features/registration/components/registration-confirmation";
import {
  getRegistration,
  listRegistrations,
} from "@/features/registration/queries";
import { shouldShowProfileHint } from "@/features/registration/registration";
import {
  divisionGroups,
  subDivisionResults,
} from "@/features/reporting/queries";
import {
  computeStandings,
  divisionStandings,
} from "@/features/reporting/standings";
import { currentUser } from "@/features/roles/guard";
import { hasSchedule } from "@/features/schedule/queries";
import { ParticipantList } from "@/features/season/components/participant-list";
import {
  ComingSoonPanel,
  RegisterCtaPanel,
  SeasonMessagePanel,
} from "@/features/season/components/pre-season";
import { InSeasonDashboard } from "@/features/season/components/season-dashboard";
import {
  buildPlayerMatches,
  currentMatchday,
  dashboardState,
  showsRoster,
  splitPlayerMatches,
} from "@/features/season/dashboard";
import {
  matchdaysForWindow,
  playerPlacement,
  subDivisionMatches,
} from "@/features/season/queries";
import { assignZones, type Zone } from "@/features/seeding/post-season";
import { divisionPostSeason, getSeeding } from "@/features/seeding/queries";
import {
  divisionName,
  subDivisionName,
  subDivisionShortName,
} from "@/features/seeding/seeding";
import {
  publicEmbargoedIds,
  withoutEmbargoed,
} from "@/features/spoilers/embargo";
import { latestWindow } from "@/features/staff/queries";
import {
  registrationState,
  seasonName,
} from "@/features/staff/registration-window";
import { seasonPhase } from "@/features/staff/season-phase";
import { germanToday } from "@/lib/german-time";
import { playerName } from "@/lib/player-name";

// Narrow shell with the plain title — used by every non-in-season state.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-12 sm:px-8">
        <h1 className="mb-9 text-[32px] text-brand-blue sm:text-[40px] dark:text-white">
          Spieler-Dashboard
        </h1>
        {children}
      </main>
    </div>
  );
}

export default async function SpielerPage() {
  const current = await currentUser();
  if (!current) {
    redirect("/");
  }

  const [window, profile] = await Promise.all([
    latestWindow(),
    getProfile(current.userId),
  ]);
  // Same nudge and the same gating as on the registration: shown until the
  // player edits their profile once or dismisses it (persisted server-side).
  const showProfileHint = shouldShowProfileHint(profile);
  const state = window ? registrationState(window, new Date()) : "not_started";
  const seeding =
    window && state === "closed" ? await getSeeding(window.id) : null;
  const seedingFinalized = Boolean(seeding?.finalizedAt);
  const scheduleExists =
    window && seedingFinalized ? await hasSchedule(window.id) : false;
  const phase = seasonPhase({
    registration: state,
    seedingFinalized,
    hasSchedule: scheduleExists,
    schedulePublished: Boolean(window?.schedulePublishedAt),
  });

  const registration = window
    ? await getRegistration(window.id, current.userId)
    : null;
  const placement =
    window && phase === "regular_season"
      ? await playerPlacement(window.id, current.userId)
      : null;

  // Teilnehmerfeld: the same roster the staff dashboard lists, reduced to
  // identity and rendered alphabetically. Only fetched in the phases that show it.
  const roster: RegisteredPlayer[] =
    window && showsRoster(phase)
      ? (await listRegistrations(window.id)).map((row) => ({
          id: row.id,
          name: playerName(row.displayName, row.username),
          avatarUrl: row.avatarUrl ?? undefined,
        }))
      : [];

  const view = dashboardState({
    phase,
    registration: state,
    hasRegistration: registration !== null,
    isPlaced: placement !== null,
  });

  if (view === "in_season" && window && placement) {
    const today = germanToday();
    const [
      rawGroups,
      matchdays,
      rawMatches,
      resultByMatchId,
      droppedIds,
      motwSelections,
      holds,
    ] = await Promise.all([
      divisionGroups(placement.divisionId),
      matchdaysForWindow(window.id),
      subDivisionMatches(placement.subDivisionId),
      subDivisionResults(placement.subDivisionId),
      droppedIdsForWindow(window.id),
      motwForWindow(window.id),
      holdsForWindow(window.id),
    ]);

    // The table counts public results only, for everyone alike: a withheld
    // result would give itself away through both players' wins and losses
    // (docs/plans/standings-embargo.md). Own results are no exception, they are
    // visible on the match page instead.
    const embargoed = publicEmbargoedIds({ motw: motwSelections, holds });
    const groups = rawGroups.map((group) => ({
      ...group,
      results: withoutEmbargoed(group.results, embargoed),
    }));
    const divisionWithheld = rawGroups.reduce(
      (total, group, index) =>
        total + (group.results.length - groups[index].results.length),
      0,
    );
    const ownIndex = rawGroups.findIndex(
      (group) => group.subDivisionId === placement.subDivisionId,
    );
    const groupWithheld =
      ownIndex >= 0
        ? rawGroups[ownIndex].results.length - groups[ownIndex].results.length
        : 0;

    // The player's own group is one of the division's groups — derive the group
    // roster + standings from it so the group is loaded only once.
    const ownGroup = groups.find(
      (group) => group.subDivisionId === placement.subDivisionId,
    );
    const members = ownGroup?.roster ?? [];

    const matchdaysByRound = new Map(
      matchdays.map((d) => [
        d.round,
        { startsOn: d.startsOn, endsOn: d.endsOn },
      ]),
    );
    const rosterById = new Map(members.map((m) => [m.userId, m]));
    const myMatches = buildPlayerMatches({
      matches: rawMatches,
      matchdaysByRound,
      rosterById,
      userId: current.userId,
    });
    const { next } = splitPlayerMatches(myMatches, today);
    const standings = markDropped(
      computeStandings({
        roster: members,
        results: ownGroup?.results ?? [],
      }),
      droppedIds,
    );

    // Post-season zones are shown on the division's *relevant* table only. In
    // `division` mode the global table carries them and is the default view; in
    // `sub_division` mode the player's own group table carries them.
    const config = await divisionPostSeason(placement.divisionId);
    const divisionMode = config?.relevantTable === "division";
    const divisionRaw = divisionMode ? divisionStandings(groups) : null;
    const division = divisionRaw ? markDropped(divisionRaw, droppedIds) : null;
    let groupZones: Map<string, Zone> | undefined;
    let divisionZones: Map<string, Zone> | undefined;
    if (division) {
      // Division mode: counts are the per-division totals.
      const zones = assignZones({
        rowCount: division.length,
        champion: config?.championshipPlayoffSlots ?? 0,
        promotions: config?.guaranteedPromotions ?? 0,
        promotionPlayoff: config?.promotionPlayoffSlots ?? 0,
        demotionPlayoff: config?.demotionPlayoffSlots ?? 0,
        demotions: config?.guaranteedDemotions ?? 0,
      });
      divisionZones = new Map(division.map((r, i) => [r.userId, zones[i]]));
    } else {
      // Sub-division mode: counts are per group, applied to the player's group.
      const zones = assignZones({
        rowCount: standings.length,
        champion: config?.championshipPlayoffSlots ?? 0,
        promotions: config?.guaranteedPromotions ?? 0,
        promotionPlayoff: config?.promotionPlayoffSlots ?? 0,
        demotionPlayoff: config?.demotionPlayoffSlots ?? 0,
        demotions: config?.guaranteedDemotions ?? 0,
      });
      groupZones = new Map(standings.map((r, i) => [r.userId, zones[i]]));
    }
    const defaultScope: "group" | "division" = division ? "division" : "group";
    // Sub-division chip labels for the merged division table (e.g. "2a").
    const divisionGroupLabels = division
      ? new Map(
          groups.flatMap((group) =>
            group.roster.map(
              (member) =>
                [
                  member.userId,
                  subDivisionShortName(placement.tier, group.position),
                ] as const,
            ),
          ),
        )
      : undefined;
    const totalRounds = matchdays.length;
    const currentRound =
      currentMatchday(matchdays, today)?.round ?? totalRounds;
    const groupName = subDivisionName(placement.tier, placement.position);

    return (
      <div className="flex flex-1 flex-col">
        <SeasonGates />
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1040px] flex-1 px-8 pt-11 pb-18">
          {showProfileHint ? (
            <div className="mb-8">
              <ProfileHint />
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h1 className="text-[28px] text-brand-blue leading-[1.1] sm:text-[34px] dark:text-white">
              Deine Saison
            </h1>
            <div className="flex items-center gap-2.5">
              <div className="h-[9px] w-[18px] -skew-x-[18deg] bg-brand-orange" />
              <span className="font-bold font-heading text-brand-blue text-xl uppercase tracking-[0.04em] dark:text-white">
                {groupName}
              </span>
              <span className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.12em]">
                · {seasonName(window.seasonNumber)}
              </span>
            </div>
          </div>
          <InSeasonDashboard
            groupName={groupName}
            currentRound={currentRound}
            totalRounds={totalRounds}
            next={next}
            matches={myMatches}
            resultByMatchId={resultByMatchId}
            standings={standings}
            groupZones={groupZones}
            divisionName={divisionName(placement.tier)}
            divisionStandings={division}
            divisionZones={divisionZones}
            divisionGroupLabels={divisionGroupLabels}
            defaultScope={defaultScope}
            meId={current.userId}
            groupWithheld={groupWithheld}
            divisionWithheld={divisionWithheld}
            today={today}
            seasonNumber={window.seasonNumber}
          />
        </main>
      </div>
    );
  }

  const closesAt = window?.closesAt ?? null;
  const seasonLabel = window ? seasonName(window.seasonNumber) : "";
  const panel =
    view === "register_cta" ? (
      <RegisterCtaPanel seasonName={seasonLabel} />
    ) : view === "registered_open" && registration ? (
      <RegistrationConfirmation
        data={registration}
        seasonName={seasonLabel}
        canWithdraw
        closesAt={closesAt}
      />
    ) : view === "registered_closed" && registration ? (
      <RegistrationConfirmation
        data={registration}
        seasonName={seasonLabel}
        canWithdraw={false}
        closesAt={closesAt}
        note="Die Anmeldung ist geschlossen. Du kannst deine Angaben nicht mehr ändern. Warte auf deine Paarungen."
      />
    ) : view === "not_registered_closed" ? (
      <SeasonMessagePanel
        title="Du bist in dieser Saison nicht dabei"
        body="Die Anmeldung ist bereits geschlossen. Die nächste Chance kommt. Schau im Discord vorbei."
      />
    ) : view === "not_placed" ? (
      <SeasonMessagePanel
        title="Du bist in der laufenden Saison nicht dabei"
        body="Für diese Saison liegt keine Einteilung für dich vor. Die nächste Anmeldung wird im Discord angekündigt."
      />
    ) : (
      <ComingSoonPanel />
    );

  return (
    <Shell>
      <SeasonGates />
      {showProfileHint ? (
        <div className="mb-8">
          <ProfileHint />
        </div>
      ) : null}
      {panel}
      {window && showsRoster(phase) ? (
        <ParticipantList players={roster} seasonName={seasonLabel} />
      ) : null}
    </Shell>
  );
}
