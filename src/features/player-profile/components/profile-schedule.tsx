"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/section-header";
import { PlayerAvatar } from "@/features/season/components/player-avatar";
import { SpoilerScore } from "@/features/spoilers/components/spoiler-score";
import { SpoilerSwitch } from "@/features/spoilers/components/spoiler-switch";
import { scoreHidden } from "@/features/spoilers/spoilers";
import { cn } from "@/lib/utils";
import type { ProfileScheduleRow } from "../profile";
import { PlayerLink } from "./player-link";

// The Spielplan section with its own switch instance: same cookie as the
// overview switch, so the preference carries in both directions; arriving
// with protection off renders the page open, the default stays protected.
export function ProfileSpielplan({
  rows,
  initialSpoilersOff,
}: {
  rows: ProfileScheduleRow[];
  initialSpoilersOff: boolean;
}) {
  const [spoilersOff, setSpoilersOff] = useState(initialSpoilersOff);
  return (
    <section className="flex flex-col gap-4">
      {/* The switch lives in the header's meta slot, so the separator rule
          spans the full section width. */}
      <SectionHeader
        meta={
          <SpoilerSwitch spoilersOff={spoilersOff} onChange={setSpoilersOff} />
        }
      >
        Spielplan
      </SectionHeader>
      <ProfileSchedule rows={rows} spoilersOff={spoilersOff} />
    </section>
  );
}

const MONTHS = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sep.",
  "Okt.",
  "Nov.",
  "Dez.",
];
function shortDate(dateStr: string): string {
  return `${Number(dateStr.slice(8, 10))}. ${MONTHS[Number(dateStr.slice(5, 7)) - 1] ?? ""}`;
}

// The profile page's Spielplan: one row per round with the opponent and the
// spoiler-protected score (site-wide rules: covered pill with tap-to-reveal,
// orange MotW pill exempt from the switch, the viewer's own matches always
// open). Rows link to the match page; byes are not clickable.
export function ProfileSchedule({
  rows,
  spoilersOff,
}: {
  rows: ProfileScheduleRow[];
  spoilersOff: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border px-4 py-4 text-center text-muted-foreground text-sm">
        Noch kein Spielplan.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <ScheduleRow key={row.matchId} row={row} spoilersOff={spoilersOff} />
      ))}
    </div>
  );
}

function ScheduleRow({
  row,
  spoilersOff,
}: {
  row: ProfileScheduleRow;
  spoilersOff: boolean;
}) {
  // MotW rows ignore the switch (permanent cover), and so does any row whose
  // result is under embargo (a recording hold); everything else follows the
  // site-wide rule. Per-row reveals reset when protection turns back on.
  const hidden =
    row.isMotw || row.embargo !== null
      ? row.reported
      : scoreHidden({
          reported: row.reported,
          isMine: row.isMine,
          spoilersOff,
        });
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!spoilersOff) {
      setRevealed(false);
    }
  }, [spoilersOff]);
  const covered = hidden && !revealed;

  const className = cn(
    "flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm",
    row.opponent && "transition-colors hover:border-brand-orange/50",
  );
  const content = (
    <>
      <span className="flex w-[92px] shrink-0 flex-col">
        <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.06em]">
          Spieltag {row.round}
        </span>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {shortDate(row.startsOn)} – {shortDate(row.endsOn)}
        </span>
      </span>
      {row.opponent ? (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <PlayerAvatar identity={row.opponent} size="size-[22px]" />
            {/* `relative` lifts the profile link above the stretched match
                link. */}
            <PlayerLink
              userId={row.opponent.userId}
              name={row.opponent.name}
              className="relative truncate font-medium"
            />
          </span>
          {/* w-14, not w-12: this slot also holds the MotW pill, which measures
              54px in Montserrat and overflowed a 48px slot. */}
          <span className="relative flex w-14 shrink-0 items-center justify-center font-semibold text-muted-foreground text-xs tabular-nums">
            {row.reported ? (
              <SpoilerScore
                scoreA={row.scoreSelf}
                scoreB={row.scoreOpponent}
                covered={covered}
                motw={row.isMotw}
                embargo={row.embargo}
                onReveal={() => setRevealed(true)}
              />
            ) : (
              "offen"
            )}
          </span>
        </>
      ) : (
        <span className="flex-1 font-semibold text-muted-foreground text-xs">
          spielfrei
        </span>
      )}
    </>
  );

  // Stretched match link underneath; opponent name links to their profile.
  return (
    <div className={cn(className, "relative")}>
      {row.opponent ? (
        <Link
          href={`/match/${row.matchId}`}
          aria-label={`Zum Match gegen ${row.opponent.name}`}
          className="absolute inset-0 rounded-lg"
        />
      ) : null}
      {content}
    </div>
  );
}
