"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyStateCard } from "@/components/empty-state-card";
import { FilterChip } from "@/components/filter-chip";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { divisionName } from "@/features/seeding/seeding";
import { emphasisSurface } from "@/lib/emphasis";
import { formatGermanDay } from "@/lib/german-time";
import { cn } from "@/lib/utils";
import {
  confirmMotw,
  dropMotwCandidate,
  type MotwActionResult,
  nominateMotwCandidate,
  revokeMotw,
} from "../actions";
import {
  canNominate,
  defaultDivisionFilter,
  type MotwOption,
  type MotwRole,
  type MotwSortMode,
  type MotwWeek,
  recordability,
  sortOptions,
  toggleAllDivisions,
} from "../motw";
import { MotwBadge } from "./motw-badge";
import { MotwCandidatePanel } from "./motw-candidate-panel";
import { MotwOptionRow, RowMarker } from "./motw-option-row";
import { MotwSide } from "./motw-player";
import { MotwVodField } from "./motw-vod-field";
import { MotwWeekPager } from "./motw-week-pager";

function ddMM(dateStr: string): string {
  return formatGermanDay(dateStr, { day: "2-digit", month: "2-digit" });
}

function shortGroup(groupName: string): string {
  return groupName.replace("Division ", "Div ");
}

const STATE_CHIP: Record<MotwWeek["state"], { label: string; loud: boolean }> =
  {
    current: { label: "Aktuelle Woche", loud: true },
    future: { label: "Kommende Woche", loud: false },
    past: { label: "Vergangen", loud: false },
  };

// The staff workspace for the Match of the Week: one Spieltag at a time across
// the full page, paged through the whole season. Staff nominate a Hauptkandidat
// and backups for the current and every later Spieltag, and confirm afterwards
// which of them actually was the Match of the Week
// (docs/plans/motw-candidates.md). A past week that was missed can still be
// confirmed; once it is, it is settled and only its VOD link stays editable.
//
// This workspace never ends an embargo: a candidate that is dropped stays
// withheld as an ordinary recording, and publishing happens under Aufnahmen or
// with the VOD link.
//
// Every week is built server-side in one pass, so paging is local state — no
// round trip, no refetch.
export function MotwManager({
  weeks,
  currentRound,
  initialRound,
}: {
  weeks: MotwWeek[];
  currentRound: number | null;
  initialRound: number;
}) {
  const [round, setRound] = useState(initialRound);
  const week = weeks.find((w) => w.round === round) ?? weeks[0] ?? null;

  if (!week) {
    return (
      <EmptyStateCard title="Kein Spielplan" informational>
        Für diese Saison sind noch keine Spieltage angelegt. Ohne Spielplan gibt
        es nichts zu wählen.
      </EmptyStateCard>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <MotwWeekPager
        weeks={weeks}
        activeRound={week.round}
        currentRound={currentRound}
        onSelect={setRound}
      />
      {/* Remounting per round resets the picker's open/filter state — moving to
          another week should not inherit the last one's division filter. */}
      <WeekPanel key={week.round} week={week} currentRound={currentRound} />
    </div>
  );
}

function WeekPanel({
  week,
  currentRound,
}: {
  week: MotwWeek;
  currentRound: number | null;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A finished week that was never confirmed stays editable — it can be
  // backfilled, and confirming after the Spieltag is the normal case.
  const { editable } = week;
  const hasPrimary = week.candidates.some((c) => c.role === "primary");
  const showPicker =
    editable && (picking || (!week.selection && week.candidates.length === 0));
  const chip = STATE_CHIP[week.state];

  // Every row action runs the same way: mark the row busy, report the error in
  // place, refresh on success. Confirming closes the picker (the week is
  // decided), nominating keeps it open so the backups can follow.
  async function run(
    matchId: string,
    act: () => Promise<MotwActionResult>,
    close: boolean,
  ) {
    setPendingId(matchId);
    setError(null);
    const result = await act();
    setPendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (close) {
      setPicking(false);
    }
    router.refresh();
  }

  const confirm = (matchId: string) =>
    run(matchId, () => confirmMotw({ matchId }), true);
  const nominate = (matchId: string, role: MotwRole) =>
    run(matchId, () => nominateMotwCandidate({ matchId, role }), false);
  const drop = (matchId: string) =>
    run(matchId, () => dropMotwCandidate({ matchId }), false);

  async function revoke() {
    setRemoving(true);
    setError(null);
    const result = await revokeMotw({ round: week.round });
    setRemoving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Tick size="m" color={week.state === "past" ? "neutral" : "orange"} />
          <h2 className="font-bold font-heading text-[24px] text-brand-blue uppercase tracking-[0.03em] dark:text-white">
            Spieltag {week.round}
          </h2>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-[3px] font-bold text-[11px] uppercase leading-none tracking-[0.06em]",
              chip.loud
                ? "border-brand-orange/50 bg-brand-orange/12 text-[#9a4b00] dark:text-brand-orange"
                : "bg-muted text-muted-foreground",
            )}
          >
            {chip.label}
          </span>
        </div>
        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          {ddMM(week.startsOn)} – {ddMM(week.endsOn)}
        </span>
      </div>

      {week.selection ? (
        <ConfirmedPanel
          week={week}
          editable={editable}
          picking={picking}
          removing={removing}
          onTogglePicking={() => setPicking((v) => !v)}
          onRevoke={revoke}
          onError={setError}
        />
      ) : week.candidates.length > 0 ? (
        // The week has candidates but no decision. Once the Spieltag is over
        // this is what holds the billboard on the previous week, so it is said
        // loudly.
        <p
          className={cn(
            "rounded-lg px-4 py-3 font-medium text-[13.5px]",
            week.state === "past"
              ? emphasisSurface("destructive")
              : "border bg-muted/40 text-muted-foreground",
          )}
        >
          {week.state === "past"
            ? "Dieser Spieltag ist vorbei. Bitte bestätigen, welches Match das Match of the Week war. Bis dahin wird weiter das Match der Vorwoche beworben."
            : "Noch nicht bestätigt. Beworben wird weiter das Match of the Week der Vorwoche, bis hier eins bestätigt ist."}
        </p>
      ) : (
        <p
          className={cn(
            "rounded-lg px-4 py-3 font-medium text-[13.5px]",
            week.state === "current"
              ? emphasisSurface("destructive")
              : "border bg-muted/40 text-muted-foreground",
          )}
        >
          {week.state === "current"
            ? "Der aktuelle Spieltag läuft noch ohne Kandidaten für das Match of the Week."
            : week.state === "past"
              ? "Dieser Spieltag ist vorbei und blieb ohne Match of the Week. Nachtragen ist noch möglich."
              : "Für diesen Spieltag ist noch kein Kandidat gewählt."}
        </p>
      )}

      {week.candidates.length > 0 ? (
        <MotwCandidatePanel
          candidates={week.candidates}
          editable={editable}
          confirmedMatchId={week.selection?.matchId ?? null}
          pendingId={pendingId}
          onConfirm={confirm}
          onPromote={(matchId) => nominate(matchId, "primary")}
          onDrop={drop}
          onAdd={() => setPicking((v) => !v)}
          addOpen={picking}
        />
      ) : null}

      {showPicker ? (
        <Picker
          week={week}
          currentRound={currentRound}
          hasPrimary={hasPrimary}
          pendingId={pendingId}
          onNominate={nominate}
          onConfirm={confirm}
        />
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </section>
  );
}

// The confirmed match, in the billboard's broadcast anatomy so the staff view
// and the public block read as the same object.
function ConfirmedPanel({
  week,
  editable,
  picking,
  removing,
  onTogglePicking,
  onRevoke,
  onError,
}: {
  week: MotwWeek;
  editable: boolean;
  picking: boolean;
  removing: boolean;
  onTogglePicking: () => void;
  onRevoke: () => void;
  onError: (error: string | null) => void;
}) {
  const match = week.selectedMatch;
  const matchId = week.selection?.matchId ?? match?.matchId;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MotwBadge>Bestätigt</MotwBadge>
        {match ? (
          <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.1em]">
            {shortGroup(match.groupName)}
          </span>
        ) : null}
        {match ? <RowMarker option={match} /> : null}
        {matchId ? (
          // Wrapped lines align left (DESIGN.md §6): below sm the link takes
          // its own left-aligned line, flush right only on the sm+ one-liner.
          <Link
            href={`/match/${matchId}`}
            className="w-full font-medium text-[13px] text-muted-foreground transition-colors hover:text-brand-blue sm:ml-auto sm:w-auto dark:hover:text-white"
          >
            Zum Match →
          </Link>
        ) : null}
      </div>

      {match ? (
        // Capped and centred: at full panel width the avatars strand themselves
        // at the edges and the matchup stops reading as one unit.
        <div className="flex flex-col gap-3 sm:mx-auto sm:grid sm:w-full sm:max-w-[640px] sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-5">
          <MotwSide player={match.playerA} side="left" size="lg" linkName />
          <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.1em]">
            vs.
          </span>
          <MotwSide player={match.playerB} side="right" size="lg" linkName />
        </div>
      ) : (
        // A confirmation whose match left the pairings (a participant dropped
        // afterwards) — still revocable, still linkable, just not renderable.
        <p className="text-muted-foreground text-sm">
          Das bestätigte Match ist nicht mehr Teil des Spielplans dieses
          Spieltags.
        </p>
      )}

      <div className="flex flex-col gap-2.5 border-brand-orange/25 border-t pt-4">
        <MotwVodField
          round={week.round}
          youtubeUrl={week.selection?.youtubeUrl ?? null}
          onError={onError}
        />
        {match?.reported && !week.selection?.youtubeUrl ? (
          // The link is what ends the result embargo — say so where it is
          // entered (docs/plans/motw-result-embargo.md).
          <p className="text-[13px] text-muted-foreground">
            Ergebnis gemeldet, noch nicht öffentlich. Mit dem VOD-Link wird es
            veröffentlicht und im Ergebniskanal gepostet.
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onTogglePicking}
          >
            {picking ? "Auswahl schließen" : "Anderes Match bestätigen"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={removing}
            title="Das Match bleibt als Backup zurückgehalten und wird unter Aufnahmen freigegeben."
            onClick={onRevoke}
          >
            {removing ? "Wird aufgehoben…" : "Bestätigung aufheben"}
          </Button>
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          Vergangene Spieltage lassen sich nicht mehr umbestätigen. Nur der
          VOD-Link bleibt änderbar.
        </p>
      )}
    </div>
  );
}

// The week's pairings. What a row does depends on where the week stands: while
// candidates are being collected it nominates (the first one becomes the
// Hauptkandidat, the rest backups), and once the week is decided — or a match
// is out of reach for a hold, which is the backfill case — it confirms
// directly.
function Picker({
  week,
  currentRound,
  hasPrimary,
  pendingId,
  onNominate,
  onConfirm,
}: {
  week: MotwWeek;
  currentRound: number | null;
  hasPrimary: boolean;
  pendingId: string | null;
  onNominate: (matchId: string, role: MotwRole) => void;
  onConfirm: (matchId: string) => void;
}) {
  const tiers = useMemo(
    () => [...new Set(week.options.map((o) => o.tier))].sort((a, b) => a - b),
    [week.options],
  );
  const roleByMatch = useMemo(
    () => new Map(week.candidates.map((c) => [c.option.matchId, c.role])),
    [week.candidates],
  );
  const [selectedTiers, setSelectedTiers] = useState(() =>
    defaultDivisionFilter(tiers),
  );
  const [sort, setSort] = useState<MotwSortMode>("division");
  const [recordableOnly, setRecordableOnly] = useState(false);

  const shown = useMemo(() => {
    const filtered = week.options.filter(
      (option) =>
        selectedTiers.has(option.tier) &&
        // Only a definite "no" is hidden. An unknown is exactly the matchup
        // staff should chase up, not one to bury.
        (!recordableOnly || recordability(option) !== "no"),
    );
    return sortOptions(filtered, sort);
  }, [week.options, selectedTiers, recordableOnly, sort]);

  const unrecordable = week.options.filter(
    (o) => recordability(o) === "no",
  ).length;
  const allSelected =
    tiers.length > 0 && tiers.every((tier) => selectedTiers.has(tier));

  function toggleTier(tier: number) {
    setSelectedTiers((current) => {
      const next = new Set(current);
      if (next.has(tier)) {
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        {tiers.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={allSelected}
              title={
                allSelected ? "Auswahl aufheben" : "Alle Divisionen auswählen"
              }
              onClick={() =>
                setSelectedTiers((current) =>
                  toggleAllDivisions(current, tiers),
                )
              }
            >
              Alle
            </FilterChip>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            {tiers.map((tier) => (
              <FilterChip
                key={tier}
                active={selectedTiers.has(tier)}
                onClick={() => toggleTier(tier)}
              >
                {divisionName(tier)}
              </FilterChip>
            ))}
          </div>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* The label lives inside the pill so the two options read as one
              control that sorts — next to "Nur aufnehmbar", which filters,
              they would otherwise look like three chips of the same kind.
              `aria-hidden` because the legend already names the group. */}
          <fieldset className="flex items-center gap-1.5 rounded-full border py-[3px] pr-[3px] pl-3">
            <legend className="sr-only">Sortierung</legend>
            <span
              aria-hidden
              className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]"
            >
              Sortierung
            </span>
            <SortButton
              active={sort === "division"}
              onClick={() => setSort("division")}
              title="In der Reihenfolge der Divisionen"
            >
              Division
            </SortButton>
            <SortButton
              active={sort === "rank"}
              onClick={() => setSort("rank")}
              title="Beste kombinierte Platzierung zuerst"
            >
              Platzierung
            </SortButton>
          </fieldset>
          {unrecordable > 0 ? (
            <FilterChip
              active={recordableOnly}
              onClick={() => setRecordableOnly((v) => !v)}
              title={`${unrecordable} Match(es) ohne Capture Card auf beiden Seiten`}
            >
              Nur aufnehmbar
            </FilterChip>
          ) : null}
        </div>
      </div>

      <span className="text-[12.5px] text-muted-foreground tabular-nums">
        {shown.length} von {week.options.length} Matches
      </span>

      {shown.length === 0 ? (
        <p className="rounded-lg border px-4 py-3 text-[13px] text-muted-foreground">
          {week.options.length === 0
            ? "Für diesen Spieltag liegen keine wählbaren Paarungen vor."
            : selectedTiers.size === 0
              ? "Keine Division ausgewählt."
              : "Kein Match passt zu den gewählten Filtern."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((option) => {
            const nominating =
              week.selection === null && canNominate(option, currentRound);
            return (
              <MotwOptionRow
                key={option.matchId}
                option={option}
                state={rowState(option, week, roleByMatch)}
                actionLabel={
                  nominating
                    ? hasPrimary
                      ? "Als Backup"
                      : "Als Hauptmatch"
                    : "Bestätigen"
                }
                pending={pendingId === option.matchId}
                disabled={pendingId !== null}
                onPick={() =>
                  nominating
                    ? onNominate(
                        option.matchId,
                        hasPrimary ? "backup" : "primary",
                      )
                    : onConfirm(option.matchId)
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// What the row already is: the confirmed match, a nominated candidate, or
// nothing yet.
function rowState(
  option: MotwOption,
  week: MotwWeek,
  roleByMatch: ReadonlyMap<string, MotwRole>,
): "primary" | "backup" | "confirmed" | null {
  if (option.matchId === week.selection?.matchId) {
    return "confirmed";
  }
  return roleByMatch.get(option.matchId) ?? null;
}

function SortButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[12.5px] transition-colors",
        active
          ? "bg-brand-orange font-semibold text-white"
          : "font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
