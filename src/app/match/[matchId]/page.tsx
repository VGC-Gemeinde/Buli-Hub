import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { DropBanner } from "@/features/drops/components/drop-banner";
import { droppedIdsForSubDivision } from "@/features/drops/queries";
import { SeasonGates } from "@/features/membership/components/season-gates";
import { MotwMatchBanner } from "@/features/motw/components/motw-match-banner";
import { motwEmbargo } from "@/features/motw/motw";
import { motwByMatchId } from "@/features/motw/queries";
import { DisputeDialog } from "@/features/reporting/components/dispute-dialog";
import { PublicMatchView } from "@/features/reporting/components/public-match-view";
import { ReportForm } from "@/features/reporting/components/report-form";
import { ReportSummary } from "@/features/reporting/components/report-summary";
import { StaffMatchPanel } from "@/features/reporting/components/staff-match-panel";
import type { StoredResult } from "@/features/reporting/queries";
import {
  getMatchForReport,
  getMatchResult,
  listStaffAndAdmins,
  matchOpenDispute,
  matchResolvedDispute,
} from "@/features/reporting/queries";
import type { EditorSheet } from "@/features/reporting/result-draft";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { matchSchedulePublished } from "@/features/schedule/queries";
import {
  parseSpoilersOff,
  SPOILERS_OFF_COOKIE,
} from "@/features/spoilers/spoilers";
import { latestWindow } from "@/features/staff/queries";
import { seasonName } from "@/features/staff/registration-window";
import { parseTeamsheet } from "@/features/teamsheets/parse";
import { monIcons } from "@/features/teamsheets/view";
import { formatGermanDateTime } from "@/lib/german-time";

// A stored sheet, prepared for the staff editor's import dialog. The icons are
// resolved here because this is a Server Component and @pkmn stays server-side.
function editorSheet(
  result: StoredResult,
  playerId: string,
): EditorSheet | null {
  const sheet = result.sheets.find((row) => row.playerId === playerId);
  if (!sheet) {
    return null;
  }
  const parsed = parseTeamsheet(sheet.ots);
  return {
    source: sheet.source,
    ots: sheet.ots,
    // A stored sheet always parses; an empty icon row is the harmless fallback.
    icons: parsed.ok ? monIcons(parsed.mons) : [],
  };
}

// Public, read-only for neutral observers; participants get the report form +
// dispute option and staff get the staff panel. Disputes are never shown to
// neutral visitors.
export default async function MatchReportPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;

  const match = await getMatchForReport(matchId);
  // A bye (playerB null) or an unknown id has no match to show.
  if (!match || !match.playerB) {
    notFound();
  }

  const current = await currentUser();
  const isParticipant =
    current !== null &&
    (current.userId === match.playerA.userId ||
      current.userId === match.playerB.userId);
  const isStaff = current !== null && roleAtLeast(current.role, "staff");
  const privileged = isParticipant || isStaff;

  // While the match's season has not published its schedule, the page is
  // staff-only — a shared link must not leak the hidden pairings.
  if (!isStaff && !(await matchSchedulePublished(matchId))) {
    notFound();
  }

  const result = await getMatchResult(matchId);
  // Match of the Week: banner for everyone. Before the VOD the result is
  // withheld from neutral viewers entirely (it never reaches the page);
  // afterwards it is spoiler-protected for them. Participants and staff see
  // it as usual, marked as not public while the embargo holds.
  const motw = await motwByMatchId(matchId);
  const embargo = motwEmbargo({ selection: motw, isStaff, isParticipant });
  // The global spoiler preference (cookie): with protection on, neutral
  // viewers get a cover instead of the summary; the MotW ignores the switch.
  const spoilersOff = parseSpoilersOff(
    (await cookies()).get(SPOILERS_OFF_COOKIE)?.value,
  );
  // Drop-decided matches: banner for everyone, no reporting.
  const droppedIds = await droppedIdsForSubDivision(match.subDivisionId);
  const aDropped = droppedIds.has(match.playerA.userId);
  const bDropped = droppedIds.has(match.playerB.userId);
  const isDropDecided = aDropped || bDropped;
  // A pending (unconfirmed) free win is not public — neutral observers see the
  // match as still open until it is confirmed.
  const pendingFreeWinHidden =
    !privileged &&
    result?.outcome === "free_win" &&
    result.confirmedAt === null;
  const shownResult =
    pendingFreeWinHidden || embargo === "withheld" ? null : result;
  // Dispute machinery stays with participants + staff.
  const dispute = result && privileged ? await matchOpenDispute(matchId) : null;
  // Once decided, the decision and its explanation are what the players get
  // back for having contested. Only the latest one, and only while no new
  // dispute is running.
  const decided =
    privileged && !dispute ? await matchResolvedDispute(matchId) : null;
  const staffOptions =
    !result && isParticipant ? await listStaffAndAdmins() : [];
  const breadcrumb = shownResult
    ? shownResult.outcome === "free_win"
      ? "Freewin"
      : "Ergebnis"
    : isParticipant
      ? "Ergebnis melden"
      : "Spiel";
  // Participants return to their dashboard, staff to the Staff area, neutral
  // observers to the public overview.
  const back = isParticipant
    ? { href: "/spieler", label: "Zurück zur Übersicht" }
    : isStaff
      ? { href: "/staff", label: "Staff-Bereich" }
      : { href: "/", label: "Zur Übersicht" };
  const editorInitial =
    result && result.outcome === "normal"
      ? {
          platform: result.platform,
          games: result.games.map((game) => ({
            winnerId: game.winnerId,
            replayUrl: game.replayUrl,
          })),
          playerASheet: editorSheet(result, match.playerA.userId),
          playerBSheet: editorSheet(result, match.playerB.userId),
          videoUrl: result.videoUrl,
        }
      : null;
  // Season label for the public kicker (go-live has a single season; the match
  // belongs to the latest window).
  const window = await latestWindow();
  const seasonLabel = window ? seasonName(window.seasonNumber) : "Saison";
  const isPendingFreeWin =
    result?.outcome === "free_win" && result.confirmedAt === null;
  const resultWinnerName =
    result?.winnerId === match.playerA.userId
      ? match.playerA.name
      : result?.winnerId === match.playerB.userId
        ? match.playerB.name
        : null;
  const pendingWinnerName = isPendingFreeWin ? resultWinnerName : null;
  // Inline spoiler protection for neutral viewers (design/SPOILER-SCHUTZ.md
  // §3): the summary always renders its normal layout with masked slots. The
  // MotW ignores the global switch; everyone else honors the cookie.
  const spoilerMode = privileged
    ? "none"
    : motw
      ? "motw"
      : spoilersOff
        ? "none"
        : "default";
  const summary = shownResult ? (
    <ReportSummary
      result={shownResult}
      playerA={match.playerA}
      playerB={match.playerB}
      viewerId={current?.userId ?? null}
      privileged={privileged}
      round={match.round}
      groupName={match.groupName}
      disputed={dispute !== null}
      backHref={back.href}
      backLabel={back.label}
      spoilerMode={spoilerMode}
    />
  ) : null;

  return (
    <div className="flex flex-1 flex-col">
      <SeasonGates />
      <SiteHeader
        breadcrumb={breadcrumb}
        breadcrumbRoot={
          isStaff && !isParticipant
            ? { href: "/staff", label: "Staff-Bereich" }
            : { href: "/spieler", label: "Spieler-Dashboard" }
        }
      />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 pt-9 pb-[168px] sm:px-8 sm:pb-[140px]">
        {motw ? (
          <MotwMatchBanner
            round={motw.round}
            youtubeUrl={motw.youtubeUrl}
            notPublic={embargo === "preview" && result !== null}
          />
        ) : null}
        {isDropDecided ? (
          <DropBanner
            playerAName={match.playerA.name}
            playerBName={match.playerB.name}
            aDropped={aDropped}
            bDropped={bDropped}
          />
        ) : null}

        {summary}

        {decided ? (
          // What the contesting player gets back: the decision and, mandatory
          // since the decision flow, why it was made.
          <div className="mt-8 flex flex-col gap-1 rounded-xl border border-brand-blue/25 bg-brand-blue/[0.03] px-6 py-5 dark:bg-muted/20">
            <p className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.1em]">
              Anfechtung entschieden
            </p>
            <p className="font-semibold text-sm">
              {decided.resolution === "corrected"
                ? "Ergebnis korrigiert"
                : "Ergebnis bestätigt"}
            </p>
            {decided.note ? (
              <p className="mt-0.5 text-muted-foreground text-sm">
                "{decided.note}"
                {decided.resolvedByName ? ` · ${decided.resolvedByName}` : ""}
                {decided.resolvedAt
                  ? `, ${formatGermanDateTime(decided.resolvedAt, {
                      day: "2-digit",
                      month: "2-digit",
                    })}`
                  : ""}
              </p>
            ) : null}
            <p className="mt-1 text-[13px] text-muted-foreground">
              Angefochten von {decided.openedByName ?? "—"}: "{decided.reason}"
            </p>
          </div>
        ) : null}

        {result && dispute ? (
          // Disputed: the result stays final in the tables; this banner records
          // the open case for participants + staff (§4.4).
          <div className="mt-8 flex flex-col gap-1.5 rounded-xl border border-destructive/35 bg-destructive/[0.06] px-6 py-5">
            <p className="font-semibold text-destructive text-sm">
              Angefochten · in Prüfung
            </p>
            <p className="text-muted-foreground text-sm">
              "{dispute.reason}" · {dispute.openedByName ?? "—"}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Das gemeldete Ergebnis zählt vorerst weiter, bis der Staff
              entschieden hat.
            </p>
          </div>
        ) : result && isParticipant ? (
          <div className="mt-10 border-t pt-5">
            <p className="mb-3 text-[13.5px] text-muted-foreground">
              Stimmt etwas nicht? Ergebnisse sind final. Eine Anfechtung wird
              vom Staff geprüft.
            </p>
            <DisputeDialog matchId={match.matchId} />
          </div>
        ) : null}

        {!shownResult ? (
          // A drop-decided match is not reportable — the banner explains the
          // counted outcome; participants get no form.
          isParticipant && current && !isDropDecided ? (
            <ReportForm
              matchId={match.matchId}
              round={match.round}
              groupName={match.groupName}
              deadline={match.deadline}
              proofRequired={match.proofRequired}
              playerA={match.playerA}
              playerB={match.playerB}
              reporterId={current.userId}
              staffOptions={staffOptions}
            />
          ) : (
            <PublicMatchView
              round={match.round}
              groupName={match.groupName}
              seasonLabel={seasonLabel}
              playerA={match.playerA}
              playerB={match.playerB}
              // A withheld MotW result: played, but not for this viewer yet.
              state={
                embargo === "withheld" &&
                result !== null &&
                !pendingFreeWinHidden
                  ? "played"
                  : "open"
              }
            />
          )
        ) : null}

        {isStaff ? (
          <StaffMatchPanel
            matchId={match.matchId}
            round={match.round}
            groupName={match.groupName}
            playerA={match.playerA}
            playerB={match.playerB}
            hasResult={result !== null}
            outcome={result?.outcome ?? null}
            winnerName={resultWinnerName}
            isPendingFreeWin={isPendingFreeWin}
            pendingWinnerName={pendingWinnerName}
            editorInitial={editorInitial}
            disputeOpen={dispute !== null}
            disputeReason={dispute?.reason ?? null}
            disputeOpenedByName={dispute?.openedByName ?? null}
          />
        ) : null}
      </main>
    </div>
  );
}
