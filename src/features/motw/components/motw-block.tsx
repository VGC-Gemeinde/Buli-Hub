"use client";

import { Eye, Lock, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import type { Identity } from "@/features/season/dashboard";
import { cn } from "@/lib/utils";
import type { MotwBlockData } from "../motw";

// The Match-of-the-Week billboard on the public overview (design/
// MATCH-OF-THE-WEEK.md §2): the league's one editorial moment per week, the
// only dark panel on the page. Shown only while its round is the current
// Spieltag. Before the VOD the result is withheld from the public (the row
// carries no score — `embargo`); staff and participants get the reveal
// with a "not public yet" marker. After the VOD the result stays behind a
// click-to-reveal so visitors can watch first (client-side reveal — a
// courtesy spoiler tag, not security). Desktop is the A · state · B
// broadcast row; mobile stacks the players with the state box between them.
export function MotwBlock({ motw }: { motw: MotwBlockData }) {
  const [revealed, setRevealed] = useState(false);
  const { match, groupName, youtubeUrl } = motw;
  const embargo = match.embargo?.access ?? null;
  // findMotw never yields a bye; the guard keeps the types honest.
  if (match.playerB === null) {
    return null;
  }

  return (
    <div className="relative mt-7 overflow-hidden rounded-xl bg-brand-blue text-white">
      {/* Signature elements: orange top strip + logo watermark. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-brand-orange"
      />
      {/* biome-ignore lint/performance/noImgElement: decorative watermark; next/image adds nothing for a local SVG */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        className="-right-[70px] -bottom-[60px] pointer-events-none absolute w-[320px] -rotate-[10deg] rounded-[36px] opacity-[0.08]"
      />

      <div className="relative flex flex-col gap-5 px-5 py-5 sm:gap-6 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-5 -skew-x-[18deg] shrink-0 bg-brand-orange"
            />
            <h2 className="whitespace-nowrap font-bold font-heading text-[20px] text-white uppercase leading-none tracking-[0.04em] sm:text-[25px]">
              Match of the Week
            </h2>
          </div>
          <span className="font-semibold text-[12px] text-white/60 uppercase tracking-[0.14em]">
            Spieltag {match.round} · {groupName}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6">
          <Side identity={match.playerA} rank={motw.rankA} align="left" />
          {/* Fixed footprint so state changes never relayout the card. */}
          <div className="flex h-[74px] min-w-0 flex-col items-center justify-center gap-[7px] sm:min-w-[190px]">
            {!match.reported ? (
              <>
                <span className="whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-4 py-1.5 font-semibold text-[12px] uppercase tracking-[0.1em]">
                  Läuft diese Woche
                </span>
                <span className="text-[11.5px] text-white/55">Best of 3</span>
              </>
            ) : embargo === "withheld" ? (
              // Played, but the result is withheld until the VOD is live:
              // nothing to reveal, the chip says when it comes.
              <>
                <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-brand-orange/65 bg-white/8 px-4 py-1.5 font-semibold text-[12px] uppercase tracking-[0.1em]">
                  <Lock aria-hidden className="size-3.5 text-brand-orange" />
                  Ergebnis folgt mit dem VOD
                </span>
                <span className="text-[11.5px] text-white/55">
                  Gespielt · Best of 3
                </span>
              </>
            ) : revealed ? (
              <>
                <span className="font-bold font-heading text-[34px] leading-none tabular-nums sm:text-[46px]">
                  {match.scoreA} : {match.scoreB}
                </span>
                <span className="text-[11.5px] text-white/55">
                  {embargo === "preview"
                    ? "Best of 3 · noch nicht öffentlich"
                    : "Best of 3 · gemeldet"}
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="flex items-center gap-2 rounded-[10px] border border-brand-orange/65 bg-white/8 px-5 py-[11px] font-semibold text-sm text-white transition-colors hover:bg-brand-orange/18"
                >
                  <Eye aria-hidden className="size-4 text-brand-orange" />
                  Ergebnis aufdecken
                </button>
                {embargo === "preview" ? (
                  <span className="flex items-center gap-1.5 text-center text-[11.5px] text-white/55">
                    <Lock aria-hidden className="size-3 text-brand-orange" />
                    Noch nicht öffentlich, erst mit dem VOD
                  </span>
                ) : (
                  <span className="text-center text-[11.5px] text-white/55">
                    Spoiler-Schutz: erst das VOD ansehen
                  </span>
                )}
              </>
            )}
          </div>
          <Side identity={match.playerB} rank={motw.rankB} align="right" />
        </div>

        <div className="flex flex-wrap items-center gap-3.5">
          {youtubeUrl ? (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg bg-brand-orange px-[18px] py-[9px] font-semibold text-sm text-white transition-colors hover:bg-[#ff8d24]"
            >
              <Play aria-hidden className="size-3.5 fill-current" />
              Auf YouTube ansehen
            </a>
          ) : (
            // Same footprint as the button — when the link lands, only the
            // fill changes. "VOD folgt" makes no timing promise.
            <span className="flex items-center gap-2 rounded-lg border border-white/35 border-dashed px-[18px] py-2 font-medium text-sm text-white/55">
              <Play aria-hidden className="size-3.5" />
              VOD folgt
            </span>
          )}
          {/* Wrapped lines align left (DESIGN.md §6): below sm the link takes
              its own left-aligned line, flush right only on the sm+
              one-liner. */}
          <Link
            href={`/match/${match.matchId}`}
            className="w-full font-medium text-[13.5px] text-white/70 transition-colors hover:text-white sm:ml-auto sm:w-auto"
          >
            Zum Match →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Side({
  identity,
  rank,
  align,
}: {
  identity: Identity;
  rank: number | null;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3.5",
        align === "right" && "sm:flex-row-reverse",
      )}
    >
      <Avatar className="size-11 border border-white/22 sm:size-[50px]">
        {identity.avatarUrl ? (
          <AvatarImage src={identity.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="bg-white/10 font-semibold text-white">
          {identity.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-0.5",
          align === "right" && "sm:items-end sm:text-right",
        )}
      >
        <PlayerLink
          userId={identity.userId}
          name={identity.name}
          className="break-words font-bold font-heading text-[22px] text-white uppercase leading-[1.02] sm:text-[32px]"
        />
        {rank !== null ? (
          <span className="font-medium text-[12px] text-white/55">
            Platz {rank}
          </span>
        ) : null}
      </div>
    </div>
  );
}
