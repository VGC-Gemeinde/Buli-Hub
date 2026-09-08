"use client";

import { Check, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyStateCard } from "@/components/empty-state-card";
import { FilterChip } from "@/components/filter-chip";
import { SectionHeader } from "@/components/section-header";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toggleAllDivisions } from "@/features/motw/motw";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import { PlayerAvatar } from "@/features/season/components/player-avatar";
import { divisionName } from "@/features/seeding/seeding";
import { StreamPhotoMark } from "@/features/stream-photos/components/stream-photo-mark";
import { emphasisSurface } from "@/lib/emphasis";
import { formatGermanDay } from "@/lib/german-time";
import { cn } from "@/lib/utils";
import { holdMatch, releaseHold } from "../actions";
import type {
  HeldMatch,
  RecordingMatch,
  RecordingPlayer,
  RecordingWeek,
} from "../holds";
import { StaleHoldsCard } from "./stale-holds-card";

// Both row actions ("Aufnehmen" and the held row's "Aufnahme") are one fixed
// width, so the trailing column lines up down the list no matter which state
// a row is in — and so the button does not resize when its label swaps.
const ROW_ACTION_WIDTH = "w-[132px]";

function ddMM(dateStr: string | null): string {
  if (!dateStr) return "—";
  return formatGermanDay(dateStr, { day: "2-digit", month: "2-digit" });
}

function shortGroup(groupName: string): string {
  return groupName.replace("Division ", "Div ");
}

// The staff workspace for recordings (docs/plans/recording-holds.md): the
// held matches with their release on top, the picker for the current and
// later Spieltage below. Every week is built server-side in one pass, so
// paging is local state.
export function RecordingManager({
  held,
  weeks,
  currentRound,
}: {
  held: HeldMatch[];
  weeks: RecordingWeek[];
  currentRound: number | null;
}) {
  const stale = held.filter((m) => m.stale);
  return (
    <div className="flex flex-col gap-11">
      <section className="flex flex-col gap-5">
        <SectionHeader count={held.length}>Zurückgehalten</SectionHeader>
        {stale.length > 0 ? (
          <StaleHoldsCard
            summary={{
              count: stale.length,
              allReported: stale.every((m) => m.reported),
            }}
            linkToPage={false}
          />
        ) : null}
        {held.length === 0 ? (
          <EmptyStateCard title="Nichts zurückgehalten" informational>
            Markiere unten ein Match, das für den Stream aufgenommen wird. Sein
            Ergebnis bleibt dann zurückgehalten, bis du es hier freigibst.
          </EmptyStateCard>
        ) : (
          <div className="flex flex-col gap-1.5">
            {held.map((match) => (
              <HeldRow key={match.matchId} match={match} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeader meta="Aktueller und kommende Spieltage">
          Match markieren
        </SectionHeader>
        {weeks.length === 0 ? (
          <EmptyStateCard title="Kein laufender Spieltag" informational>
            Die Saison hat keinen aktuellen oder kommenden Spieltag mehr. Es
            gibt nichts mehr zu markieren.
          </EmptyStateCard>
        ) : (
          <Picker weeks={weeks} currentRound={currentRound} />
        )}
      </section>
    </div>
  );
}

// --- Held list -------------------------------------------------------------

type StateChip = {
  label: string;
  tone: "ready" | "open" | "free" | "stale";
};

function stateChip(match: RecordingMatch): StateChip {
  if (match.pendingFreeWin) {
    return { label: "Freewin offen", tone: "free" };
  }
  if (match.reported) {
    return { label: "gemeldet", tone: "ready" };
  }
  return { label: "offen", tone: "open" };
}

function ChipEl({ chip }: { chip: StateChip }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-[3px] font-semibold text-xs leading-none",
        chip.tone === "ready" &&
          "bg-brand-blue/10 text-brand-blue dark:bg-white/12 dark:text-white",
        chip.tone === "open" && "bg-muted text-muted-foreground",
        chip.tone === "free" &&
          "bg-brand-orange/14 text-brand-blue dark:text-white",
        chip.tone === "stale" && "bg-destructive/10 text-destructive",
      )}
    >
      {chip.label}
    </span>
  );
}

function Pairing({ match }: { match: RecordingMatch }) {
  return (
    <Link
      href={`/match/${match.matchId}`}
      className="min-w-0 flex-1 truncate font-medium text-sm hover:text-brand-blue dark:hover:text-white"
    >
      {match.playerA.name} <span className="text-muted-foreground">vs.</span>{" "}
      {match.playerB.name}
    </Link>
  );
}

// One held match, in the dashboard worklist's row anatomy (group · Spieltag,
// pairing, state, deadline, action). A stale one wears the destructive
// surface of an overdue match: same urgency, same look. Releasing a reported
// match publishes and posts, so that one asks first; removing the mark from
// an open match changes nothing visible and just happens.
function HeldRow({ match }: { match: HeldMatch }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chip = stateChip(match);

  async function release() {
    setPending(true);
    setError(null);
    const result = await releaseHold({ matchId: match.matchId });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return { ok: false as const, error: result.error };
    }
    router.refresh();
    return { ok: true as const };
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3.5 sm:py-2",
        match.stale && emphasisSurface("destructive"),
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <span className="w-24 shrink-0 whitespace-nowrap font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.06em]">
          {shortGroup(match.groupName)} · S{match.round}
        </span>
        <Pairing match={match} />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:contents">
        {match.stale ? (
          <ChipEl chip={{ label: "Spieltag vorbei", tone: "stale" }} />
        ) : null}
        <ChipEl chip={chip} />
        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums sm:w-12 sm:text-right">
          {ddMM(match.endsOn)}
        </span>
        {/* Wrapped lines align left (DESIGN.md §6): the action sits at the
            row's end on sm+, on the stacked layout it takes the left. */}
        <span className="flex items-center gap-2 sm:ml-auto">
          {match.reported ? (
            <ReleaseDialog
              playerAName={match.playerA.name}
              playerBName={match.playerB.name}
              onConfirm={release}
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={release}
            >
              {pending ? "Wird entfernt…" : "Markierung entfernen"}
            </Button>
          )}
        </span>
      </div>
      {error ? (
        <p className="w-full text-destructive text-sm sm:basis-full">{error}</p>
      ) : null}
    </div>
  );
}

// Releasing a reported result is the one irreversible step here: the score
// goes public and the Discord post is made. Hence the question.
function ReleaseDialog({
  playerAName,
  playerBName,
  onConfirm,
  trigger,
}: {
  playerAName: string;
  playerBName: string;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
  // The picker uses the row's own state button as the trigger; the list uses
  // the plain button below.
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await onConfirm();
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Fehler");
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Freigeben
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ergebnis freigeben?</DialogTitle>
          <DialogDescription>
            {playerAName} vs. {playerBName}: Das Ergebnis wird sofort öffentlich
            und im Ergebniskanal gepostet. Das lässt sich nicht rückgängig
            machen.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Abbrechen
            </Button>
          </DialogClose>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Wird freigegeben…" : "Freigeben"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Picker ----------------------------------------------------------------

function Picker({
  weeks,
  currentRound,
}: {
  weeks: RecordingWeek[];
  currentRound: number | null;
}) {
  const [round, setRound] = useState(weeks[0]?.round ?? 0);
  const week = weeks.find((w) => w.round === round) ?? weeks[0];
  if (!week) {
    return null;
  }
  return (
    <div className="flex flex-col gap-6">
      <WeekPager
        weeks={weeks}
        activeRound={week.round}
        currentRound={currentRound}
        onSelect={setRound}
      />
      {/* Remounting per round resets the division filter — another week
          should not inherit the last one's. */}
      <WeekPanel key={week.round} week={week} />
    </div>
  );
}

// The Spieltag strip, in the MotW pager's chip anatomy (round number over a
// mark) so both staff workspaces page the same way. The mark counts the
// week's holds; the ring is the running Spieltag.
function WeekPager({
  weeks,
  activeRound,
  currentRound,
  onSelect,
}: {
  weeks: RecordingWeek[];
  activeRound: number;
  currentRound: number | null;
  onSelect: (round: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="-mx-1 overflow-x-auto px-1 py-1"
        role="tablist"
        aria-label="Spieltag wählen"
      >
        <div className="flex gap-1.5">
          {weeks.map((week) => {
            const holds = week.matches.filter((m) => m.held).length;
            const active = week.round === activeRound;
            const isCurrent = week.round === currentRound;
            return (
              <button
                key={week.round}
                type="button"
                role="tab"
                aria-selected={active}
                title={`Spieltag ${week.round}: ${
                  holds === 0
                    ? "keine Aufnahme markiert"
                    : holds === 1
                      ? "1 Aufnahme markiert"
                      : `${holds} Aufnahmen markiert`
                }${isCurrent ? " · aktueller Spieltag" : ""}`}
                onClick={() => onSelect(week.round)}
                className={cn(
                  "flex w-[42px] shrink-0 flex-col items-center gap-1.5 rounded-lg border py-1.5 transition-colors",
                  active
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "hover:border-brand-orange/50 hover:bg-muted",
                  isCurrent && !active && "border-brand-orange/70",
                  isCurrent &&
                    active &&
                    "ring-2 ring-brand-orange ring-offset-2 ring-offset-background",
                )}
              >
                <span className="font-semibold text-[13px] leading-none tabular-nums">
                  {week.round}
                </span>
                <HoldMark count={holds} active={active} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HoldMark count={1} active={false} />
          Aufnahmen markiert (Anzahl)
        </span>
        <span className="flex items-center gap-1.5">
          <HoldMark count={0} active={false} />
          Keine
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-brand-orange" />
          Aktueller Spieltag
        </span>
      </div>
    </div>
  );
}

function HoldMark({ count, active }: { count: number; active: boolean }) {
  if (count === 0) {
    return (
      <span
        aria-hidden
        className="h-[2px] w-2.5 rounded-full bg-current opacity-30"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[11px] min-w-[11px] items-center justify-center rounded-full px-[3px] font-bold text-[8px] leading-none tabular-nums",
        active
          ? "bg-white text-brand-blue"
          : "bg-brand-blue text-white dark:bg-white dark:text-brand-blue",
      )}
    >
      {count}
    </span>
  );
}

function WeekPanel({ week }: { week: RecordingWeek }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tiers = useMemo(
    () => [...new Set(week.matches.map((m) => m.tier))].sort((a, b) => a - b),
    [week.matches],
  );
  // Every division to start with: a recording can come from anywhere in the
  // league, there is no "usual" tier the way the MotW has one.
  const [selectedTiers, setSelectedTiers] = useState(() => new Set(tiers));
  const allSelected =
    tiers.length > 0 && tiers.every((tier) => selectedTiers.has(tier));

  // Drop-decided matches have nothing to record and never appear.
  const candidates = useMemo(
    () => week.matches.filter((m) => !m.decidedByDrop),
    [week.matches],
  );
  const shown = candidates.filter((m) => selectedTiers.has(m.tier));

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

  async function run(
    matchId: string,
    action: (input: {
      matchId: string;
    }) => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    setPendingId(matchId);
    setError(null);
    const result = await action({ matchId });
    setPendingId(null);
    if (!result.ok) {
      setError(result.error);
      return result;
    }
    router.refresh();
    return result;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Tick size="m" />
          <h3 className="font-bold font-heading text-[20px] text-brand-blue uppercase tracking-[0.03em] dark:text-white">
            Spieltag {week.round}
          </h3>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-[3px] font-bold text-[11px] uppercase leading-none tracking-[0.06em]",
              week.state === "current"
                ? "border-brand-orange/50 bg-brand-orange/12 text-[#9a4b00] dark:text-brand-orange"
                : "bg-muted text-muted-foreground",
            )}
          >
            {week.state === "current" ? "Aktuelle Woche" : "Kommende Woche"}
          </span>
        </div>
        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
          {ddMM(week.startsOn)} – {ddMM(week.endsOn)}
        </span>
      </div>

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
        <span className="text-[12.5px] text-muted-foreground tabular-nums">
          {shown.length} von {candidates.length} Matches
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border px-4 py-3 text-[13px] text-muted-foreground">
          {candidates.length === 0
            ? "Für diesen Spieltag liegen keine Paarungen vor."
            : "Keine Division ausgewählt."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shown.map((match) => (
            <PickRow
              key={match.matchId}
              match={match}
              pending={pendingId === match.matchId}
              disabled={pendingId !== null}
              onHold={() => run(match.matchId, holdMatch)}
              onRelease={() => run(match.matchId, releaseHold)}
            />
          ))}
        </div>
      )}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </section>
  );
}

function Side({
  player,
  align,
}: {
  player: RecordingPlayer;
  align: "left" | "right";
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2",
        align === "right" && "sm:flex-row-reverse",
      )}
    >
      <PlayerAvatar identity={player} size="size-7" />
      <PlayerLink
        userId={player.userId}
        name={player.name}
        className="truncate font-medium text-sm"
      />
      {/* Whether the stream has a picture of this player. The avatar next to
          it is the hub's own; these are two different things. */}
      <StreamPhotoMark photoUrl={player.streamPhotoUrl} name={player.name} />
    </span>
  );
}

// One markable pairing. A held row wears the "Aufnahme" chip and offers the
// release; a reported row is out (its result is public) and says so; every
// other row offers the mark. The trailing column is fixed so the avatar
// columns never shift between rows.
function PickRow({
  match,
  pending,
  disabled,
  onHold,
  onRelease,
}: {
  match: RecordingMatch;
  pending: boolean;
  disabled: boolean;
  onHold: () => void;
  onRelease: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const busy = disabled && !pending;
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-center gap-x-3 gap-y-2.5 rounded-lg border px-3 py-2.5 sm:grid-cols-[60px_1fr_auto_1fr_200px] sm:py-2",
        match.held &&
          "border-brand-blue/45 bg-brand-blue/[0.04] dark:border-white/35 dark:bg-white/[0.05]",
        match.reported && !match.held && "opacity-60",
        busy && "opacity-55",
      )}
    >
      <span className="whitespace-nowrap font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
        {shortGroup(match.groupName)}
      </span>
      <Side player={match.playerA} align="left" />
      <span className="hidden text-[11.5px] text-muted-foreground/70 sm:block">
        vs.
      </span>
      <Side player={match.playerB} align="right" />
      {/* Wrapped lines align left (DESIGN.md §6): the stacked mobile grid
          gives this cell its own line, right-aligned only from sm up. */}
      <span className="flex items-center gap-2 sm:justify-end">
        {match.held ? (
          match.reported ? (
            // A held match that is already reported: removing the mark
            // publishes the result, so it goes through the same question as
            // the list above.
            <ReleaseDialog
              playerAName={match.playerA.name}
              playerBName={match.playerB.name}
              onConfirm={onRelease}
              trigger={(open) => (
                <HoldButton
                  action="Freigeben"
                  pending={pending}
                  disabled={disabled}
                  onClick={open}
                />
              )}
            />
          ) : (
            <HoldButton
              action="Entfernen"
              pending={pending}
              disabled={disabled}
              onClick={onRelease}
            />
          )
        ) : match.reported ? (
          <span
            title="Das Ergebnis ist bereits öffentlich. Ein gemeldetes Match lässt sich nicht mehr zurückhalten."
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] font-semibold text-[11px] text-muted-foreground leading-none"
          >
            <Check aria-hidden className="size-3" />
            {match.pendingFreeWin ? "Freewin offen" : "gemeldet"}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              ROW_ACTION_WIDTH,
              "h-7 px-2.5 text-[12.5px] hover:border-brand-orange hover:bg-brand-orange hover:text-white",
            )}
            disabled={disabled}
            onClick={onHold}
          >
            <Video aria-hidden className="size-3.5" />
            {pending ? "Wird markiert…" : "Aufnehmen"}
          </Button>
        )}
      </span>
    </div>
  );
}

// The trailing button of a held row: it shows what the row *is* ("Aufnahme",
// the navy state fill) and, on hover and keyboard focus, what a click *does*
// (orange, the same "click does this" fill the "Aufnehmen" button hovers to).
// Both labels sit in one grid cell, so the button keeps the width of the wider
// one and the column never shifts between rows. The accessible name is always
// the action, so nothing depends on hovering.
function HoldButton({
  action,
  pending,
  disabled,
  onClick,
}: {
  action: "Entfernen" | "Freigeben";
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label =
    action === "Freigeben"
      ? "Ergebnis freigeben und Markierung entfernen"
      : "Aufnahme-Markierung entfernen";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        ROW_ACTION_WIDTH,
        "group/hold grid h-7 shrink-0 place-items-center rounded-md px-2.5 font-semibold text-[12.5px] transition-colors",
        "bg-brand-blue text-white dark:bg-white dark:text-brand-blue",
        "hover:bg-brand-orange hover:text-white focus-visible:bg-brand-orange focus-visible:text-white dark:hover:bg-brand-orange dark:hover:text-white dark:focus-visible:bg-brand-orange dark:focus-visible:text-white",
      )}
    >
      {pending ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          Wird entfernt…
        </span>
      ) : (
        <>
          <span className="col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap group-focus-visible/hold:invisible group-hover/hold:invisible">
            <Video aria-hidden className="size-3.5" />
            Aufnahme
          </span>
          <span className="invisible col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap group-focus-visible/hold:visible group-hover/hold:visible">
            <X aria-hidden className="size-3.5" />
            {action}
          </span>
        </>
      )}
    </button>
  );
}
