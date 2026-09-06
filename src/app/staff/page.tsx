import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyStateCard } from "@/components/empty-state-card";
import { ActionLink } from "@/components/links";
import { PlayerGrid, type RegisteredPlayer } from "@/components/player-grid";
import { SectionHeader } from "@/components/section-header";
import { SiteHeader } from "@/components/site-header";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { DiscordSeasonCard } from "@/features/discord-season/components/discord-season-card";
import { seasonDiscordConfig } from "@/features/discord-season/config";
import { getSyncState } from "@/features/discord-season/queries";
import { cardView, needsAttention } from "@/features/discord-season/report";
import { DropsSection } from "@/features/drops/components/drops-section";
import { listDropCandidates, listDrops } from "@/features/drops/queries";
import { MembershipList } from "@/features/membership/components/membership-list";
import { MembershipWarningCard } from "@/features/membership/components/warning-card";
import {
  bucketMembership,
  type RosterMembership,
} from "@/features/membership/membership";
import { registeredMembership } from "@/features/membership/queries";
import { sweepGuildMemberships } from "@/features/membership/sweep";
import { MotwTodoCard } from "@/features/motw/components/motw-todo-card";
import { motwTodo } from "@/features/motw/motw";
import { motwForWindow } from "@/features/motw/queries";
import { listRegistrations } from "@/features/registration/queries";
import { SaisonDashboard } from "@/features/reporting/components/saison-dashboard";
import {
  windowMatchOverview,
  windowResolvedDisputes,
} from "@/features/reporting/queries";
import { bucketMatches } from "@/features/reporting/staff-dashboard";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { PublishScheduleCard } from "@/features/schedule/components/publish-schedule-card";
import { subDivisionRosters } from "@/features/schedule/queries";
import { defaultDeadlines, spieltagCount } from "@/features/schedule/spieltage";
import {
  currentMatchday,
  type MatchdayLite,
} from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import {
  PreseasonTodoCard,
  type ScheduleSetup,
} from "@/features/staff/components/preseason-todo-card";
import { SeasonCard } from "@/features/staff/components/registration-status";
import { latestWindow, windowSeasonPhase } from "@/features/staff/queries";
import { seasonName } from "@/features/staff/registration-window";
import { formatGermanDay, germanToday } from "@/lib/german-time";
import { playerName } from "@/lib/player-name";

function ddMM(dateStr: string): string {
  return formatGermanDay(dateStr, {
    day: "2-digit",
    month: "2-digit",
  });
}

// The running-season header strip: identity, progress, and the entry points
// that replace the pre-season Saison/Einteilung sections.
function SeasonStrip({
  season,
  label,
  currentRound,
  totalRounds,
  week,
}: {
  season: string;
  label: string;
  currentRound: number | null;
  totalRounds: number;
  week: MatchdayLite | null;
}) {
  const pct =
    totalRounds > 0 && currentRound ? (currentRound / totalRounds) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-6 rounded-lg border px-5.5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="font-bold font-heading text-[22px] text-brand-blue uppercase leading-none dark:text-white">
          {season}
        </span>
        <Tick size="s" />
        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="whitespace-nowrap font-semibold text-[13px] tabular-nums">
          Spieltag {currentRound ?? "—"} von {totalRounds}
        </span>
        <div className="h-1.5 w-32 max-w-full rounded-full bg-muted sm:w-40">
          <div
            className="h-1.5 rounded-full bg-brand-orange"
            style={{ width: `${pct}%` }}
          />
        </div>
        {week ? (
          <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
            {ddMM(week.startsOn)} – {ddMM(week.endsOn)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-3.5 font-medium text-[13.5px]"
        >
          <Link href="/spielplan">Spielplan</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-3.5 font-medium text-[13.5px]"
        >
          <Link href="/staff/motw">Match of the Week</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-3.5 font-medium text-[13.5px]"
        >
          <Link href="/staff/seeding">Divisionen</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function StaffPage() {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    redirect("/");
  }

  const window = await latestWindow();
  const { phase, registration: state } = window
    ? await windowSeasonPhase(window)
    : {
        phase: "not_started" as const,
        registration: "not_started" as const,
      };

  // Membership state of the registered roster, freshly swept (one Discord
  // call, fail-open). Both layouts show the list, and the warning card up top
  // fires whenever confirmed non-members are registered.
  let membershipRoster: RosterMembership[] = [];
  if (window) {
    await sweepGuildMemberships(window.id);
    membershipRoster = await registeredMembership(window.id);
  }
  const nonMemberCount = bucketMembership(membershipRoster).nonMembers.length;
  const membershipListId = "discord-mitgliedschaft";

  // Running season: the /staff page *is* the dashboard — staff lands on their
  // work, no separate page. schedule_hidden gets the same dashboard (staff
  // review the season exactly as it will run) plus the publish card on top.
  if ((phase === "regular_season" || phase === "schedule_hidden") && window) {
    const today = germanToday();
    const [
      overview,
      matchdays,
      resolvedDisputes,
      motwSelections,
      drops,
      dropCandidates,
    ] = await Promise.all([
      windowMatchOverview(window.id),
      matchdaysForWindow(window.id),
      windowResolvedDisputes(window.id),
      motwForWindow(window.id),
      listDrops(window.id),
      listDropCandidates(window.id),
    ]);
    const week = currentMatchday(matchdays, today);
    const { overdue, thisWeek, pendingFreeWins, disputed } = bucketMatches({
      matches: overview,
      currentRound: week?.round ?? null,
      today,
    });
    const todo = motwTodo({
      currentRound: week?.round ?? null,
      totalRounds: matchdays.length,
      selectedRounds: new Set(motwSelections.map((s) => s.round)),
    });

    // schedule_hidden: the publish todo, summarizing what goes live. The
    // overview excludes byes, so its length is the real match count; a
    // schedule always has at least one matchday.
    const sortedDays = [...matchdays].sort((a, b) => a.round - b.round);
    const publishFacts =
      phase === "schedule_hidden" && sortedDays.length > 0
        ? {
            rounds: sortedDays.length,
            matches: overview.length,
            groups: new Set(overview.map((m) => m.groupName)).size,
            firstDeadline: sortedDays[0].endsOn,
            lastDeadline: sortedDays[sortedDays.length - 1].endsOn,
          }
        : null;

    // regular_season: the Discord card, only while the last sync says the
    // server does not match the league (docs/plans/discord-season-setup.md).
    // Read from the stored report — the page never talks to Discord.
    const discordSyncState =
      phase === "regular_season" && seasonDiscordConfig() !== null
        ? await getSyncState(window.id)
        : undefined;
    const now = new Date();
    const discordView =
      discordSyncState !== undefined && needsAttention(discordSyncState, now)
        ? cardView(discordSyncState, now)
        : null;

    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1040px] flex-1 px-8 py-12">
          <h1 className="mb-9 text-[40px] text-brand-blue dark:text-white">
            Staff-Bereich
          </h1>
          <div className="flex flex-col gap-4.5">
            <SeasonStrip
              season={seasonName(window.seasonNumber)}
              label={
                phase === "schedule_hidden"
                  ? "Spielplan intern"
                  : "Reguläre Saison"
              }
              currentRound={week?.round ?? null}
              totalRounds={matchdays.length}
              week={week}
            />
            {publishFacts ? <PublishScheduleCard facts={publishFacts} /> : null}
            {discordView ? <DiscordSeasonCard view={discordView} /> : null}
            {todo ? <MotwTodoCard todo={todo} /> : null}
            {nonMemberCount > 0 ? (
              <MembershipWarningCard
                count={nonMemberCount}
                listId={membershipListId}
              />
            ) : null}
            <SaisonDashboard
              overdue={overdue}
              thisWeek={thisWeek}
              pendingFreeWins={pendingFreeWins}
              disputed={disputed}
              resolvedDisputes={resolvedDisputes}
              today={today}
            />
            <DropsSection drops={drops} candidates={dropCandidates} />
            <MembershipList
              roster={membershipRoster}
              seasonName={seasonName(window.seasonNumber)}
              canCancel={false}
              id={membershipListId}
            />
          </div>
        </main>
      </div>
    );
  }

  // Pre-season: registration + seeding management.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const registrationUrl = `${protocol}://${host}/anmeldung`;
  const players: RegisteredPlayer[] = window
    ? (await listRegistrations(window.id)).map((row) => ({
        id: row.id,
        name: playerName(row.displayName, row.username),
        avatarUrl: row.avatarUrl ?? undefined,
      }))
    : [];

  let scheduleSetup: ScheduleSetup | null = null;
  if (phase === "seeded" && window) {
    const rosters = await subDivisionRosters(window.id);
    const sizes = rosters.map((roster) => roster.userIds.length);
    const count = spieltagCount(sizes);
    const seasonStart = germanToday();
    if (count > 0) {
      scheduleSetup = {
        seasonStart,
        deadlines: defaultDeadlines(seasonStart, count),
        groups: rosters.length,
        matches: sizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0),
        largest: Math.max(...sizes),
      };
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1040px] flex-1 px-8 py-12">
        <div className="mb-9 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-[40px] text-brand-blue dark:text-white">
            Staff-Bereich
          </h1>
          {roleAtLeast(current.role, "admin") ? (
            <ActionLink href="/staff/nutzung" className="text-sm">
              Nutzung
            </ActionLink>
          ) : null}
        </div>
        <div className="flex flex-col gap-10">
          {phase === "registration_closed" || phase === "seeded" ? (
            <PreseasonTodoCard phase={phase} scheduleSetup={scheduleSetup} />
          ) : null}

          {nonMemberCount > 0 ? (
            <MembershipWarningCard
              count={nonMemberCount}
              listId={membershipListId}
            />
          ) : null}

          <section className="flex flex-col gap-5">
            <SectionHeader>Saison</SectionHeader>
            <SeasonCard
              state={state}
              season={window ? seasonName(window.seasonNumber) : null}
              registrationUrl={registrationUrl}
              closesAt={window?.closesAt ?? null}
            />
          </section>

          {state !== "not_started" ? (
            <section className="flex flex-col gap-5">
              <SectionHeader meta={`${players.length} gesamt`}>
                Anmeldungen
              </SectionHeader>
              <PlayerGrid
                players={players}
                empty={
                  <EmptyStateCard title="Noch keine Anmeldungen" informational>
                    Sobald sich die ersten Spieler über den Anmeldelink
                    registrieren, erscheinen sie hier.
                  </EmptyStateCard>
                }
              />
            </section>
          ) : null}

          {window ? (
            <MembershipList
              roster={membershipRoster}
              seasonName={seasonName(window.seasonNumber)}
              canCancel={phase === "registration_closed"}
              id={membershipListId}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
