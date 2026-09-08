import Link from "next/link";
import { EmptyStateCard } from "@/components/empty-state-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import type { Identity } from "@/features/season/dashboard";

// Public, result-less match page for neutral visitors (guests and non-
// participant players): the pairing with a status chip and an informational
// edge-state card. Replaces the bare "Noch kein Ergebnis gemeldet." line
// (GO-LIVE-POLISH §4.4). Once reported, the normal ReportSummary is shown —
// except while the result is under embargo and withheld from the public: the
// Match of the Week before its VOD (docs/plans/motw-result-embargo.md) or a
// match held for a recording (docs/plans/recording-holds.md). Those are the
// two "played" states: same page, different words about when the result comes.
export type PublicMatchState = "open" | "played_motw" | "played_recording";

const STATE_COPY: Record<
  PublicMatchState,
  { chip: string; sub: string; line: string; title: string; body: string }
> = {
  open: {
    chip: "Offen",
    sub: "Best of 3",
    line: "Ergebnis wird nach der Meldung hier angezeigt.",
    title: "Noch kein Ergebnis",
    body: "Die beiden Spieler haben ihr Match noch nicht gemeldet. Sobald ein Ergebnis vorliegt, findest du hier Spiele, Replays und Teamsheets.",
  },
  played_motw: {
    chip: "Gespielt",
    sub: "Ergebnis folgt mit dem VOD",
    line: "Das Ergebnis wird veröffentlicht, sobald das VOD online ist.",
    title: "Ergebnis folgt mit dem VOD",
    body: "Das Match of the Week ist gespielt. Spiele, Replays und Teamsheets erscheinen hier zusammen mit dem VOD, damit niemand vorher gespoilert wird.",
  },
  played_recording: {
    chip: "Gespielt",
    sub: "Ergebnis folgt nach dem Stream",
    line: "Das Ergebnis wird veröffentlicht, sobald der Stream vorbei ist.",
    title: "Ergebnis folgt nach dem Stream",
    body: "Dieses Match wurde für den Stream aufgenommen. Spiele, Replays und Teamsheets erscheinen hier, sobald der Staff das Ergebnis freigibt, damit niemand vorher gespoilert wird.",
  },
};

function Face({ identity }: { identity: Identity }) {
  return (
    <Avatar className="size-10 sm:size-[46px]">
      {identity.avatarUrl ? (
        <AvatarImage src={identity.avatarUrl} alt="" />
      ) : null}
      <AvatarFallback>{identity.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function PublicMatchView({
  round,
  groupName,
  seasonLabel,
  playerA,
  playerB,
  state = "open",
}: {
  round: number;
  groupName: string;
  seasonLabel: string;
  playerA: Identity;
  playerB: Identity;
  state?: PublicMatchState;
}) {
  const copy = STATE_COPY[state];
  // "Gespielt" reads as progress, so it gets the brand tint the grey "Offen"
  // deliberately lacks.
  const chipClass =
    state !== "open"
      ? "bg-brand-blue/10 text-brand-blue dark:bg-white/12 dark:text-white"
      : "bg-muted text-muted-foreground";
  return (
    <>
      <Link
        href="/"
        className="mb-4.5 inline-block font-medium text-[13px] text-muted-foreground hover:text-brand-blue dark:hover:text-white"
      >
        ← Zur Übersicht
      </Link>
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
        Spieltag {round} · {groupName} · {seasonLabel}
      </p>
      <h1 className="mt-2 text-[34px] text-brand-blue leading-[1.1] sm:text-[40px] dark:text-white">
        <span className="break-words">{playerA.name}</span>{" "}
        <span className="text-muted-foreground">vs.</span>{" "}
        <span className="break-words">{playerB.name}</span>
      </h1>

      {/* Mobile: each player on their own row, name never truncated — mirrors
          the reported result view. */}
      <div className="mt-6 flex flex-col divide-y rounded-xl border bg-muted/30 sm:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Face identity={playerA} />
          <span className="min-w-0 flex-1 break-words font-bold font-heading text-[18px] text-brand-blue uppercase leading-[1.15] dark:text-white">
            <PlayerLink userId={playerA.userId} name={playerA.name} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-2.5 pr-4 pl-[68px]">
          <span
            className={`rounded-full px-3 py-[3px] font-semibold text-[12px] uppercase tracking-[0.08em] ${chipClass}`}
          >
            {copy.chip}
          </span>
          <span className="text-[12px] text-muted-foreground">{copy.sub}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Face identity={playerB} />
          <span className="min-w-0 flex-1 break-words font-bold font-heading text-[18px] text-brand-blue uppercase leading-[1.15] dark:text-white">
            <PlayerLink userId={playerB.userId} name={playerB.name} />
          </span>
        </div>
      </div>

      {/* Desktop: A · B with the status centred between them. */}
      <div className="mt-6 hidden grid-cols-[1fr_auto_1fr] items-center gap-4.5 rounded-xl border bg-muted/30 px-[30px] py-5 sm:grid">
        <div className="flex min-w-0 items-center gap-3">
          <Face identity={playerA} />
          <PlayerLink
            userId={playerA.userId}
            name={playerA.name}
            className="truncate font-bold font-heading text-[22px] text-brand-blue uppercase leading-[1.05] dark:text-white"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span
            className={`whitespace-nowrap rounded-full px-3 py-[3px] font-semibold text-[12px] uppercase tracking-[0.08em] ${chipClass}`}
          >
            {copy.chip}
          </span>
          <span className="whitespace-nowrap font-medium text-[11px] text-muted-foreground">
            {copy.sub}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-3">
          <PlayerLink
            userId={playerB.userId}
            name={playerB.name}
            className="truncate text-right font-bold font-heading text-[22px] text-brand-blue uppercase leading-[1.05] dark:text-white"
          />
          <Face identity={playerB} />
        </div>
      </div>

      <p className="mt-3.5 text-[13px] text-muted-foreground">{copy.line}</p>

      <div className="mt-8">
        <EmptyStateCard title={copy.title} informational>
          {copy.body}
        </EmptyStateCard>
      </div>
    </>
  );
}
