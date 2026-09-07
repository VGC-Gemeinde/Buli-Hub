"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionLink } from "@/components/links";
import { SectionHeader } from "@/components/section-header";
import { Tick } from "@/components/tick";
import { MotwBlock } from "@/features/motw/components/motw-block";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import { PlayerAvatar } from "@/features/season/components/player-avatar";
import { StandingsTable } from "@/features/season/components/standings-panel";
import type { MatchdayLite } from "@/features/season/dashboard";
import { SpoilerScore } from "@/features/spoilers/components/spoiler-score";
import { SpoilerSwitch } from "@/features/spoilers/components/spoiler-switch";
import { scoreHidden } from "@/features/spoilers/spoilers";
import { cn } from "@/lib/utils";
import type { PublicDivision, PublicMatch, PublicOverview } from "../queries";

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
export function weekRange(startsOn: string, endsOn: string): string {
  return month(startsOn) === month(endsOn)
    ? `${day(startsOn)}.–${day(endsOn)}. ${month(endsOn)}`
    : `${day(startsOn)}. ${month(startsOn)} – ${day(endsOn)}. ${month(endsOn)}`;
}

// A pill switcher (division / group). Container `rounded-full`, 30px pills,
// active = solid orange with white text (DESIGN.md §4.5, §8.2). Pills wrap on
// narrow screens; the `py` on the row keeps a comfortable touch box.
export function Switcher({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border bg-muted/40 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === selected}
          onClick={() => onSelect(o.value)}
          className={cn(
            "inline-flex h-[30px] items-center justify-center rounded-full px-3.5 font-semibold text-[13px] uppercase tracking-[0.06em] transition-colors",
            o.value === selected
              ? "bg-brand-orange text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// The public league overview: switch division → switch group → read one table at
// a time and browse the Spieltage. Read-only; a logged-in visitor gets their row
// highlighted (meId) and a link back to their dashboard.
export function PublicLeague({
  overview,
  meId,
  initialSpoilersOff,
}: {
  overview: PublicOverview;
  meId: string;
  initialSpoilersOff: boolean;
}) {
  const [tier, setTier] = useState(overview.divisions[0]?.tier ?? 1);
  // The global spoiler preference: cookie-backed (the server rendered this
  // state), toggled here, honored by the match pages.
  const [spoilersOff, setSpoilersOff] = useState(initialSpoilersOff);
  const division =
    overview.divisions.find((d) => d.tier === tier) ?? overview.divisions[0];

  return (
    <div className="mx-auto w-full max-w-[1040px] flex-1 px-6 pt-10 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Tick size="l" />
          <h1 className="text-[28px] text-brand-blue leading-[1.1] sm:text-[34px] dark:text-white">
            VGC Bundesliga
          </h1>
          <span className="whitespace-nowrap font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.12em]">
            · {overview.seasonName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          {overview.currentRound ? (
            <span className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.12em]">
              Spieltag {overview.currentRound} / {overview.totalRounds}
            </span>
          ) : null}
          <ActionLink href="/spielplan" className="text-sm">
            Kompletter Spielplan
          </ActionLink>
          <SpoilerSwitch spoilersOff={spoilersOff} onChange={setSpoilersOff} />
        </div>
      </div>

      {overview.motw ? <MotwBlock motw={overview.motw} /> : null}

      <div className="mt-6">
        <Switcher
          options={overview.divisions.map((d) => ({
            value: String(d.tier),
            label: d.name,
          }))}
          selected={String(tier)}
          onSelect={(value) => setTier(Number(value))}
        />
      </div>

      {division ? (
        <DivisionView
          key={division.tier}
          division={division}
          matchdays={overview.matchdays}
          currentRound={overview.currentRound}
          totalRounds={overview.totalRounds}
          meId={meId}
          spoilersOff={spoilersOff}
        />
      ) : null}
    </div>
  );
}

function DivisionView({
  division,
  matchdays,
  currentRound,
  totalRounds,
  meId,
  spoilersOff,
}: {
  division: PublicDivision;
  matchdays: MatchdayLite[];
  currentRound: number | null;
  totalRounds: number;
  meId: string;
  spoilersOff: boolean;
}) {
  // Selection is either a sub-division id or "gesamt" (only offered when the
  // division has a merged Gesamttabelle, i.e. in division mode). Gesamt shows the
  // merged table and the whole division's schedule; it is the default there.
  const gesamt = division.divisionStandings !== null;
  const [selected, setSelected] = useState<string>(
    gesamt ? "gesamt" : (division.groups[0]?.subDivisionId ?? ""),
  );
  const [round, setRound] = useState(currentRound ?? 1);
  const showGesamt = selected === "gesamt" && gesamt;
  const group = showGesamt
    ? null
    : (division.groups.find((g) => g.subDivisionId === selected) ??
      division.groups[0]);

  if (!showGesamt && !group) {
    return (
      <p className="mt-8 text-muted-foreground">
        Für diese Division liegen noch keine Gruppen vor.
      </p>
    );
  }

  const matchday = matchdays.find((m) => m.round === round) ?? null;
  // Both section heads carry the same meta (§4.5): the division name in Gesamt
  // mode, otherwise the full group name ("Division 1a").
  const scopeMeta = showGesamt || !group ? division.name : group.name;
  // Group switcher labels are short ("1a" → uppercased "1A"); the division is
  // already named in the row above, so the "Division"-prefix would be redundant.
  const options = [
    ...(gesamt ? [{ value: "gesamt", label: "Gesamt" }] : []),
    ...division.groups.map((g) => ({
      value: g.subDivisionId,
      label: g.shortName,
    })),
  ];

  return (
    <div className="mt-7 flex flex-col gap-8">
      <Switcher options={options} selected={selected} onSelect={setSelected} />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
        <section className="flex flex-col gap-3">
          <SectionHeader meta={scopeMeta}>Tabelle</SectionHeader>
          {showGesamt && division.divisionStandings ? (
            <StandingsTable
              standings={division.divisionStandings}
              meId={meId}
              zones={division.divisionZones ?? undefined}
              groupLabels={division.divisionGroupLabels ?? undefined}
            />
          ) : group ? (
            <StandingsTable
              standings={group.standings}
              meId={meId}
              zones={group.zones ?? undefined}
            />
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader meta={scopeMeta}>Spielplan</SectionHeader>
          <SpieltagTimeline
            selected={round}
            total={totalRounds}
            current={currentRound}
            matchday={matchday}
            onSelect={setRound}
          />
          {showGesamt ? (
            <div className="flex flex-col gap-5">
              {division.groups.map((g) => (
                <div key={g.subDivisionId} className="flex flex-col gap-2">
                  <p className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.12em]">
                    {g.name}
                  </p>
                  <MatchdayList
                    matches={g.matches.filter((m) => m.round === round)}
                    meId={meId}
                    spoilersOff={spoilersOff}
                  />
                </div>
              ))}
            </div>
          ) : group ? (
            <MatchdayList
              matches={group.matches.filter((m) => m.round === round)}
              meId={meId}
              spoilersOff={spoilersOff}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

// Browsable version of the dashboard's progress strip: one clickable segment per
// Spieltag. The current matchday keeps its orange marker; the selected round is
// outlined so you can tell "viewing" from "live".
function SpieltagTimeline({
  selected,
  total,
  current,
  matchday,
  onSelect,
}: {
  selected: number;
  total: number;
  current: number | null;
  matchday: MatchdayLite | null;
  onSelect: (round: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.12em]">
          Spieltag {selected} von {total}
        </span>
        {matchday ? (
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {weekRange(matchday.startsOn, matchday.endsOn)}
          </span>
        ) : null}
      </div>
      <div className="flex gap-[5px]">
        {Array.from({ length: total }, (_, i) => i + 1).map((round) => {
          const isSelected = round === selected;
          const isCurrent = round === current;
          return (
            <button
              key={round}
              type="button"
              aria-label={`Spieltag ${round}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(round)}
              className="group flex-1 py-1.5"
            >
              <span
                className={cn(
                  "block h-2 rounded-[3px] transition-colors",
                  isSelected
                    ? "bg-brand-orange"
                    : isCurrent
                      ? "bg-brand-orange/45 group-hover:bg-brand-orange/70"
                      : current !== null && round < current
                        ? "bg-brand-blue/30 group-hover:bg-brand-blue/50"
                        : "bg-muted group-hover:bg-muted-foreground/30",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MatchdayList({
  matches,
  meId,
  spoilersOff,
}: {
  matches: PublicMatch[];
  meId: string;
  spoilersOff: boolean;
}) {
  if (matches.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Für diesen Spieltag liegen noch keine Paarungen vor.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => (
        <MatchRow
          key={match.matchId}
          match={match}
          meId={meId}
          spoilersOff={spoilersOff}
        />
      ))}
    </div>
  );
}

function MatchRow({
  match,
  meId,
  spoilersOff,
}: {
  match: PublicMatch;
  meId: string;
  spoilersOff: boolean;
}) {
  const mine = match.playerA.userId === meId || match.playerB?.userId === meId;
  // Foreign reported results are covered until revealed in place (or via the
  // global switch). The MotW ignores the switch: its orange cover pill is the
  // row's only marker and stays until tapped (courtesy tag, not security) —
  // and before the VOD there is nothing behind it for a withheld viewer.
  const hidden = match.isMotw
    ? match.reported
    : scoreHidden({ reported: match.reported, isMine: mine, spoilersOff });
  const [revealed, setRevealed] = useState(false);
  // Turning protection back on clears per-row reveals — a fresh cover, no
  // half-revealed leftovers (design/SPOILER-SCHUTZ.md §2.1).
  useEffect(() => {
    if (!spoilersOff) {
      setRevealed(false);
    }
  }, [spoilersOff]);
  const covered = hidden && !revealed;
  const className = cn(
    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
    mine && "border-brand-orange/40 bg-brand-orange/5",
    match.playerB && "transition-colors hover:border-brand-orange/50",
  );
  const content = (
    <>
      <Side
        identity={match.playerA}
        // Winner bolding on a covered row would leak the result; it returns
        // once the row is revealed (also on the MotW row).
        winner={!covered && match.winnerId === match.playerA.userId}
        align="left"
      />
      {match.playerB === null ? (
        <span className="shrink-0 text-center font-semibold text-muted-foreground text-xs tabular-nums">
          spielfrei
        </span>
      ) : (
        // Fixed-width slot: pill ⇄ score ⇄ "offen" swap without any shift.
        // `relative` lifts the pill above the stretched match link.
        // w-14, not w-12: the slot also holds the MotW pill, which measures 54px
        // in Montserrat and overflowed a 48px slot. Kept a fixed width rather
        // than fit-content so the column stays aligned across rows.
        <span className="relative flex w-14 shrink-0 items-center justify-center font-semibold text-muted-foreground text-xs tabular-nums">
          {match.reported ? (
            // A pending free win is not shown publicly until confirmed → "offen".
            <SpoilerScore
              scoreA={match.scoreA}
              scoreB={match.scoreB}
              covered={covered}
              motw={match.isMotw}
              embargo={match.motwEmbargo}
              onReveal={() => setRevealed(true)}
            />
          ) : (
            "offen"
          )}
        </span>
      )}
      {match.playerB ? (
        <Side
          identity={match.playerB}
          winner={!covered && match.winnerId === match.playerB.userId}
          align="right"
        />
      ) : (
        <span className="min-w-0 flex-1" />
      )}
    </>
  );
  // The whole row links to the match via a stretched link underneath; the
  // player names (and the reveal pill) sit above it and link to the profiles.
  // Byes are not clickable.
  return (
    <div className={cn(className, "relative")}>
      {match.playerB ? (
        <Link
          href={`/match/${match.matchId}`}
          aria-label={`Zum Match ${match.playerA.name} vs. ${match.playerB.name}`}
          className="absolute inset-0 rounded-lg"
        />
      ) : null}
      {content}
    </div>
  );
}

function Side({
  identity,
  winner,
  align,
}: {
  identity: { userId: string; name: string; avatarUrl: string | null };
  winner: boolean;
  align: "left" | "right";
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        align === "right" && "flex-row-reverse",
      )}
    >
      <PlayerAvatar identity={identity} size="size-[22px]" />
      {/* `relative` lifts the profile link above the row's stretched match
          link. */}
      <PlayerLink
        userId={identity.userId}
        name={identity.name}
        className={cn(
          "relative truncate",
          winner ? "font-semibold" : "font-medium",
        )}
      />
    </span>
  );
}
