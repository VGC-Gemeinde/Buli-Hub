"use client";

import { Check, Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MotwCandidate } from "../motw";
import { RowMarker } from "./motw-option-row";
import { MotwSide } from "./motw-player";

function shortGroup(groupName: string): string {
  return groupName.replace("Division ", "Div ");
}

// The nominated matches of a Spieltag (docs/plans/motw-candidates.md): the
// Hauptmatch staff plan to feature and the backups they record in case it
// falls through. Navy, not orange: a candidate is a recording, and orange
// stays reserved for the confirmed Match of the Week.
//
// Each candidate is a small pick panel — the confirmed panel's anatomy (meta
// row, matchup, divider, action bar) at list scale. The actions get their own
// line on purpose: confirming, promoting and removing are three real choices,
// and squeezing them into a trailing cell next to the players left them
// wrapped and unreadable as buttons.
export function MotwCandidatePanel({
  candidates,
  editable,
  confirmedMatchId,
  pendingId,
  onConfirm,
  onPromote,
  onDrop,
  onAdd,
  addOpen,
}: {
  candidates: MotwCandidate[];
  editable: boolean;
  confirmedMatchId: string | null;
  pendingId: string | null;
  onConfirm: (matchId: string) => void;
  onPromote: (matchId: string) => void;
  onDrop: (matchId: string) => void;
  onAdd: () => void;
  addOpen: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/45 bg-brand-blue/[0.07] px-2.5 py-[3px] font-bold text-[10.5px] text-brand-blue uppercase leading-none tracking-[0.08em] dark:border-white/35 dark:bg-white/[0.08] dark:text-white">
          <span
            aria-hidden
            className="h-1.5 w-3 -skew-x-[18deg] bg-brand-blue dark:bg-white"
          />
          {confirmedMatchId ? "Weitere Kandidaten" : "Kandidaten"}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {candidates.length === 1 ? "1 Match" : `${candidates.length} Matches`}
        </span>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={onAdd}
          >
            {addOpen ? "Auswahl schließen" : "Kandidat hinzufügen"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.option.matchId}
            candidate={candidate}
            editable={editable}
            confirmed={candidate.option.matchId === confirmedMatchId}
            pending={pendingId === candidate.option.matchId}
            disabled={pendingId !== null}
            onConfirm={() => onConfirm(candidate.option.matchId)}
            onPromote={() => onPromote(candidate.option.matchId)}
            onDrop={() => onDrop(candidate.option.matchId)}
          />
        ))}
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Alle Kandidaten werden wie Aufnahmen zurückgehalten: Ergebnis, Replays
        und Teamsheets sehen nur Staff und die beiden Spieler. Wer nicht
        bestätigt wird, bleibt zurückgehalten und wird unter{" "}
        <Link
          href="/staff/aufnahmen"
          className="font-medium text-brand-blue underline-offset-2 hover:underline dark:text-white"
        >
          Aufnahmen
        </Link>{" "}
        freigegeben.
      </p>
    </div>
  );
}

function CandidateCard({
  candidate,
  editable,
  confirmed,
  pending,
  disabled,
  onConfirm,
  onPromote,
  onDrop,
}: {
  candidate: MotwCandidate;
  editable: boolean;
  confirmed: boolean;
  pending: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onPromote: () => void;
  onDrop: () => void;
}) {
  const { option, role } = candidate;
  const primary = role === "primary";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-background px-4 py-3",
        // The Hauptmatch is the week's plan, so it carries the navy edge the
        // rest of the recording states use.
        primary &&
          "border-brand-blue/45 bg-brand-blue/[0.04] dark:border-white/35 dark:bg-white/[0.05]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <RoleChip primary={primary} />
        <span className="whitespace-nowrap font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
          {shortGroup(option.groupName)}
        </span>
        <RowMarker option={option} />
        {/* Wrapped lines align left (DESIGN.md §6): below sm the link takes its
            own left-aligned line, flush right only on the sm+ one-liner. */}
        <Link
          href={`/match/${option.matchId}`}
          className="w-full font-medium text-[13px] text-muted-foreground transition-colors hover:text-brand-blue sm:ml-auto sm:w-auto dark:hover:text-white"
        >
          Zum Match →
        </Link>
      </div>

      {/* Capped and centred like the confirmed panel: at full card width the
          avatars strand themselves at the edges and the matchup stops reading
          as one unit. */}
      <div className="flex flex-col gap-2.5 sm:mx-auto sm:grid sm:w-full sm:max-w-[640px] sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
        <MotwSide player={option.playerA} side="left" />
        <span className="hidden text-[11.5px] text-muted-foreground/70 sm:block">
          vs.
        </span>
        <MotwSide player={option.playerB} side="right" />
      </div>

      {editable && !confirmed ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            title="Dieses Match als Match of the Week des Spieltags bestätigen"
            onClick={onConfirm}
          >
            <Check aria-hidden />
            {pending ? "Wird bestätigt…" : "Bestätigen"}
          </Button>
          {primary ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              title="Dieses Match als geplantes Hauptmatch der Woche markieren"
              onClick={onPromote}
            >
              <Star aria-hidden />
              Zum Hauptmatch
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive sm:ml-auto"
            disabled={disabled}
            title="Aus der Auswahl nehmen. Das Match bleibt für den Stream zurückgehalten."
            onClick={onDrop}
          >
            Entfernen
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// What the candidate is to the week. Static, not a control: promoting is the
// button in the action bar, and a chip that sometimes reacts to a click and
// sometimes does not would be the worse affordance.
function RoleChip({ primary }: { primary: boolean }) {
  return (
    <span
      title={
        primary
          ? "Das geplante Match of the Week dieser Woche"
          : "Backup, falls das Hauptmatch ausfällt"
      }
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] font-bold text-[10.5px] uppercase leading-none tracking-[0.06em]",
        primary
          ? "bg-brand-blue text-white dark:bg-white dark:text-brand-blue"
          : "border border-border text-muted-foreground",
      )}
    >
      {primary ? <Star aria-hidden className="size-3 fill-current" /> : null}
      {primary ? "Hauptmatch" : "Backup"}
    </span>
  );
}
