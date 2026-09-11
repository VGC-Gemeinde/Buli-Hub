import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import { RegelwerkCard } from "@/features/regelwerk/components/dashboard-card";
import { matchDisplayState, scoreFor } from "@/features/reporting/match-state";
import type { MatchResultLite } from "@/features/reporting/queries";
import type { StandingsRow } from "@/features/reporting/standings";
import { cn } from "@/lib/utils";
import { daysUntil, type PlayerMatch } from "../dashboard";
import { PlayerAvatar } from "./player-avatar";
import { StandingsPanel, type ZoneMap } from "./standings-panel";

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function day(dateStr: string): number {
  return Number(dateStr.slice(8, 10));
}
function month(dateStr: string): string {
  return MONTHS[Number(dateStr.slice(5, 7)) - 1] ?? "";
}
function formatDeadline(dateStr: string): string {
  return `${day(dateStr)}. ${month(dateStr)}`;
}
function weekRange(startsOn: string, endsOn: string): string {
  return month(startsOn) === month(endsOn)
    ? `${day(startsOn)}.–${day(endsOn)}. ${month(endsOn)}`
    : `${day(startsOn)}. ${month(startsOn)} – ${day(endsOn)}. ${month(endsOn)}`;
}
function deadlineHint(endsOn: string, today: string): string {
  const days = daysUntil(endsOn, today);
  if (days < 0) return "überfällig";
  if (days === 0) return "heute fällig";
  if (days === 1) return "noch 1 Tag";
  return `noch ${days} Tage`;
}

// The season progress strip: one segment per Spieltag, current in orange.
function ProgressStrip({ current, total }: { current: number; total: number }) {
  return (
    <div className="mt-4.5 mb-8 flex items-center gap-3.5">
      <div className="flex flex-1 gap-[5px]">
        {Array.from({ length: total }, (_, i) => i + 1).map((round) => (
          <div
            key={round}
            className={cn(
              "h-1.5 flex-1 rounded-[3px]",
              // Played weeks are navy in light mode, but navy on the dark
              // background scored 1.02:1 — invisible, and fainter than the
              // not-yet-played track (1.51:1), inverting the hierarchy. White at
              // 35% restores it, following the same light-navy/dark-white pattern
              // as `Tick`'s navy variant.
              round < current
                ? "bg-brand-blue/30 dark:bg-white/35"
                : round === current
                  ? "bg-brand-orange"
                  : "bg-muted dark:bg-white/12",
            )}
          />
        ))}
      </div>
      {/* 12px/0.04em, not 13px/0.1em: the caption shares this row with the bar
          (`flex-1`), so every pixel it takes is a pixel the bar loses. Montserrat
          is wider than the Barlow Condensed this was tuned for and the caption
          grew to 149px, visibly cutting the bar short. These values put it back
          at ~126px — the width the layout was designed around. */}
      <span className="whitespace-nowrap font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.04em]">
        Spieltag {current} von {total}
      </span>
    </div>
  );
}

// The hero: the player's next match. Swaps to the recorded result once reported.
function Hero({
  match,
  result,
  meId,
  today,
}: {
  match: PlayerMatch | null;
  result: MatchResultLite | null;
  meId: string;
  today: string;
}) {
  if (!match) {
    return (
      <section className="rounded-lg border px-[30px] py-[26px]">
        <p className="text-muted-foreground">
          Deine Spiele sind gemeldet. Die reguläre Saison ist für dich
          abgeschlossen.
        </p>
      </section>
    );
  }

  const label = (text: string) => (
    <div className="flex items-center gap-2">
      <Tick size="s" />
      <span className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
        {text}
      </span>
    </div>
  );

  if (!match.opponent) {
    return (
      <section className="rounded-lg border px-[30px] py-[26px]">
        {label(`Spieltag ${match.round}`)}
        <p className="mt-3 font-bold font-heading text-[32px] text-brand-blue uppercase leading-none dark:text-white">
          Spielfrei
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          Diese Woche hast du kein Match. Zeit zum Vorbereiten.
        </p>
      </section>
    );
  }

  const reported =
    result !== null &&
    !(result.outcome === "free_win" && result.confirmedAt === null);
  const pendingFreeWin =
    result !== null &&
    result.outcome === "free_win" &&
    result.confirmedAt === null;
  const daysLeft = daysUntil(match.endsOn, today);

  return (
    <section className="flex flex-col gap-5 rounded-lg border px-5 py-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6 sm:px-[30px] sm:py-[26px]">
      <div className="flex min-w-0 flex-col gap-4.5">
        {label(
          reported
            ? `Ergebnis · Spieltag ${match.round}`
            : `Nächstes Match · Spieltag ${match.round}`,
        )}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4.5">
          <PlayerAvatar
            identity={{ userId: meId, name: "Du", avatarUrl: null }}
            size="size-[46px]"
            filled
          />
          <span className="-skew-x-[10deg] px-1 font-bold font-heading text-brand-orange text-xl">
            VS
          </span>
          <PlayerAvatar identity={match.opponent} size="size-[46px]" />
          <span className="min-w-0 truncate font-bold font-heading text-[22px] text-brand-blue uppercase leading-none dark:text-white">
            {match.opponent.name}
          </span>
        </div>
      </div>

      {reported && result ? (
        <Link
          href={`/match/${match.matchId}`}
          className="group flex flex-col items-start gap-2 sm:min-h-[74px] sm:items-end sm:justify-center"
        >
          <ReportedBadge result={result} meId={meId} />
          {result.disputed ? (
            <span className="rounded-full bg-destructive/10 px-2.5 py-[3px] font-semibold text-destructive text-xs">
              Angefochten
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-blue text-sm group-hover:underline dark:text-white">
              Ansehen{" "}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
          )}
        </Link>
      ) : pendingFreeWin ? (
        <Link
          href={`/match/${match.matchId}`}
          className="group flex flex-col items-start gap-2 sm:min-h-[74px] sm:items-end sm:justify-center"
        >
          <span className="rounded-full bg-brand-orange/12 px-4 py-2 font-semibold text-brand-blue text-sm dark:text-white">
            Freewin · wartet auf Bestätigung
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-brand-blue text-sm group-hover:underline dark:text-white">
            Ansehen{" "}
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
        </Link>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-7">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-col sm:items-start sm:gap-1">
            <span className="w-full font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em] sm:w-auto">
              Deadline
            </span>
            <span className="font-bold font-heading text-2xl text-brand-blue uppercase dark:text-white">
              {formatDeadline(match.endsOn)}
            </span>
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold text-[13px]",
                daysLeft <= 2
                  ? "bg-brand-orange text-white"
                  : "bg-brand-orange/12 text-brand-blue dark:text-white",
              )}
            >
              {deadlineHint(match.endsOn, today)}
            </span>
          </div>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/match/${match.matchId}`}>Ergebnis melden</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function ReportedBadge({
  result,
  meId,
}: {
  result: MatchResultLite;
  meId: string;
}) {
  const score = scoreFor(meId, result);
  return (
    <div className="flex items-center gap-3">
      {score.label ? (
        <span
          className={cn(
            "rounded-full px-2.5 py-[3px] font-semibold text-xs",
            score.label === "Sieg"
              ? "bg-brand-orange/12 text-brand-blue dark:text-white"
              : "bg-muted text-muted-foreground",
          )}
        >
          {score.label}
        </span>
      ) : null}
      <span className="whitespace-nowrap font-bold font-heading text-[30px] text-brand-blue leading-none tracking-[0.04em] dark:text-white">
        {score.self} : {score.opponent}
      </span>
    </div>
  );
}

// One row of "Dein Spielplan".
function ScheduleRow({
  match,
  result,
  meId,
  today,
}: {
  match: PlayerMatch;
  result: MatchResultLite | null;
  meId: string;
  today: string;
}) {
  const state = matchDisplayState({
    match: {
      startsOn: match.startsOn,
      endsOn: match.endsOn,
      opponent: match.opponent,
    },
    result: result
      ? { outcome: result.outcome, confirmedAt: result.confirmedAt }
      : null,
    today,
  });
  const isBye = match.opponent === null;
  const pastBye = isBye && today > match.endsOn;

  const chip =
    "size-[34px] shrink-0 rounded-lg font-bold font-heading text-[17px]";
  // flex-wrap: when the status side (chips, score, date range) does not fit
  // next to the opponent name, it drops onto its own line instead of
  // squeezing the name away — the name keeps a min-width floor.
  const row = cn(
    "flex min-h-[54px] flex-wrap items-center gap-x-3.5 gap-y-1 rounded-lg border py-2.5 pr-4 pl-2.5",
    state === "current" && "border-brand-orange/45 bg-brand-orange/5",
    state === "overdue" && "border-destructive/35 bg-destructive/5",
    pastBye && "opacity-55",
  );

  const inner = (
    <>
      <div
        className={cn(
          chip,
          "flex items-center justify-center",
          state === "current"
            ? "bg-brand-orange text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        {match.round}
      </div>
      {isBye ? (
        <div className="flex min-w-36 flex-1 items-center gap-2.5">
          <div className="size-7 shrink-0 rounded-full border border-dashed" />
          <span className="font-medium text-muted-foreground">Spielfrei</span>
        </div>
      ) : match.opponent ? (
        <div className="flex min-w-36 flex-1 items-center gap-2.5">
          <PlayerAvatar identity={match.opponent} />
          {/* `relative` lifts the profile link above the stretched match
              link. */}
          <PlayerLink
            userId={match.opponent.userId}
            name={match.opponent.name}
            className="relative truncate font-semibold text-[15px]"
          />
        </div>
      ) : null}
      <RowRight match={match} result={result} state={state} meId={meId} />
    </>
  );

  // The row links to the match via a stretched link underneath; the opponent
  // name links to their profile above it. Byes are not clickable.
  return (
    <div className={cn(row, "relative", !isBye && "hover:bg-muted/40")}>
      {isBye || !match.opponent ? null : (
        <Link
          href={`/match/${match.matchId}`}
          aria-label={`Zum Match gegen ${match.opponent.name}`}
          className="absolute inset-0 rounded-lg"
        />
      )}
      {inner}
    </div>
  );
}

function RowRight({
  match,
  result,
  state,
  meId,
}: {
  match: PlayerMatch;
  result: MatchResultLite | null;
  state: ReturnType<typeof matchDisplayState>;
  meId: string;
}) {
  // Below sm every variant takes a full line of its own under the opponent —
  // chips, score and date range never compete with the name. Wrapped lines
  // align left (DESIGN.md §6); only the one-line layout from sm up is flush
  // right via ml-auto.
  const range = (
    <span className="text-[13px] text-muted-foreground">
      {weekRange(match.startsOn, match.endsOn)}
    </span>
  );
  if (state === "reported" && result) {
    const score = scoreFor(meId, result);
    return (
      <div className="ml-auto flex w-full shrink-0 items-center gap-3 sm:w-auto">
        {result.disputed ? (
          <span className="whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-[3px] font-semibold text-destructive text-xs">
            Angefochten
          </span>
        ) : null}
        {score.label ? (
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-[3px] font-semibold text-xs",
              score.label === "Sieg"
                ? "bg-brand-orange/12 text-brand-blue dark:text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {score.label}
          </span>
        ) : null}
        <span className="min-w-[34px] whitespace-nowrap text-right font-bold font-heading text-[19px] text-brand-blue tracking-[0.04em] dark:text-white">
          {score.self} : {score.opponent}
        </span>
      </div>
    );
  }
  if (state === "pending_free_win") {
    return (
      <div className="ml-auto flex w-full sm:w-auto">
        <span className="whitespace-nowrap rounded-full bg-brand-orange/12 px-2.5 py-[3px] font-semibold text-brand-blue text-xs dark:text-white">
          Freewin · offen
        </span>
      </div>
    );
  }
  if (state === "overdue") {
    return (
      <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
        <span className="whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-[3px] font-semibold text-destructive text-xs">
          Überfällig
        </span>
        {range}
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
        <span className="whitespace-nowrap font-semibold text-brand-orange text-xs uppercase tracking-[0.1em]">
          Diese Woche
        </span>
        {range}
      </div>
    );
  }
  return <div className="ml-auto flex w-full sm:w-auto">{range}</div>;
}

// The full in-season dashboard: progress → hero → Spielplan + Tabelle.
export function InSeasonDashboard({
  groupName,
  currentRound,
  totalRounds,
  next,
  matches,
  resultByMatchId,
  standings,
  groupZones,
  divisionName,
  divisionStandings,
  divisionZones,
  divisionGroupLabels,
  defaultScope,
  meId,
  groupWithheld,
  divisionWithheld,
  today,
  seasonNumber,
}: {
  groupName: string;
  currentRound: number;
  totalRounds: number;
  next: PlayerMatch | null;
  matches: PlayerMatch[];
  resultByMatchId: Map<string, MatchResultLite>;
  standings: StandingsRow[];
  groupZones?: ZoneMap;
  divisionName: string;
  divisionStandings: StandingsRow[] | null;
  divisionZones?: ZoneMap;
  divisionGroupLabels?: Map<string, string>;
  defaultScope: "group" | "division";
  meId: string;
  // Embargoed results that do not count in the tables yet
  // (docs/plans/standings-embargo.md).
  groupWithheld?: number;
  divisionWithheld?: number;
  today: string;
  seasonNumber: number;
}) {
  return (
    <>
      <ProgressStrip current={currentRound} total={totalRounds} />
      <Hero
        match={next}
        result={next ? (resultByMatchId.get(next.matchId) ?? null) : null}
        meId={meId}
        today={today}
      />
      <div className="mt-10 grid grid-cols-1 items-start gap-7 lg:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-3">
          <SectionHeader meta={`${totalRounds} Spieltage`}>
            Dein Spielplan
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {matches.map((match) => (
              <ScheduleRow
                key={match.matchId}
                match={match}
                result={resultByMatchId.get(match.matchId) ?? null}
                meId={meId}
                today={today}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader meta={groupName}>Tabelle</SectionHeader>
          <StandingsPanel
            groupName={groupName}
            groupStandings={standings}
            groupZones={groupZones}
            divisionName={divisionName}
            divisionStandings={divisionStandings}
            divisionZones={divisionZones}
            divisionGroupLabels={divisionGroupLabels}
            defaultScope={defaultScope}
            meId={meId}
            groupWithheld={groupWithheld}
            divisionWithheld={divisionWithheld}
          />
          <RegelwerkCard seasonNumber={seasonNumber} />
        </section>
      </div>
    </>
  );
}
