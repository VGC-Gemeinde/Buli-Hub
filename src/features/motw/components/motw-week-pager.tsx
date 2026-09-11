"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MotwWeek } from "../motw";

// The season strip: every Spieltag at once, with where it stands. This is what
// replaced the separate "Frühere Spieltage" list — a round that is still
// undecided, or confirmed without a VOD, is visible here without a second list
// to work through.
//
// The four marks are shapes, not colors (filled dot / ring / diamond / dash),
// and the legend below spells them out.
export function MotwWeekPager({
  weeks,
  activeRound,
  currentRound,
  onSelect,
}: {
  weeks: MotwWeek[];
  activeRound: number;
  currentRound: number | null;
  onSelect: (round: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const index = weeks.findIndex((week) => week.round === activeRound);

  // Long seasons scroll: keep the open week in view when it changes, including
  // when the chevrons walk past the edge of the strip.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, []);

  const step = (delta: number) => {
    const next = weeks[index + delta];
    if (next) {
      onSelect(next.round);
      // The freshly activated chip has not rendered yet — scroll on the next
      // frame, once the ref points at it.
      requestAnimationFrame(() =>
        activeRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        }),
      );
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* `w-fit` keeps the chevrons next to the strip in a short season instead
          of pinning them to the page edges; a long one fills the width and
          scrolls. */}
      <div className="flex w-fit max-w-full items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Vorheriger Spieltag"
          disabled={index <= 0}
          onClick={() => step(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>

        <div
          className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 py-1"
          role="tablist"
          aria-label="Spieltag wählen"
        >
          <div className="flex gap-1.5">
            {weeks.map((week) => (
              <WeekChip
                key={week.round}
                ref={week.round === activeRound ? activeRef : undefined}
                week={week}
                active={week.round === activeRound}
                isCurrent={week.round === currentRound}
                onSelect={() => onSelect(week.round)}
              />
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Nächster Spieltag"
          disabled={index < 0 || index >= weeks.length - 1}
          onClick={() => step(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
        <LegendItem mark={<Mark state="vod" />}>Bestätigt · VOD da</LegendItem>
        <LegendItem mark={<Mark state="no-vod" />}>
          Bestätigt · VOD fehlt
        </LegendItem>
        <LegendItem mark={<Mark state="candidates" />}>
          Kandidaten · nicht bestätigt
        </LegendItem>
        <LegendItem mark={<Mark state="open" />}>Offen</LegendItem>
        <LegendItem
          mark={
            <span className="size-2.5 rounded-[3px] border border-brand-orange" />
          }
        >
          Aktueller Spieltag
        </LegendItem>
      </div>
    </div>
  );
}

function LegendItem({
  mark,
  children,
}: {
  mark: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {mark}
      {children}
    </span>
  );
}

type MarkState = "vod" | "no-vod" | "candidates" | "open";

function markState(week: MotwWeek): MarkState {
  if (week.selection) {
    return week.selection.youtubeUrl ? "vod" : "no-vod";
  }
  return week.candidates.length > 0 ? "candidates" : "open";
}

function Mark({ state }: { state: MarkState }) {
  if (state === "open") {
    return (
      <span
        aria-hidden
        className="h-[2px] w-2.5 rounded-full bg-current opacity-30"
      />
    );
  }
  if (state === "candidates") {
    // A diamond: the week has matches in the running but no decision. It
    // inherits the chip's own color (`border-current`), because the active chip
    // is navy and a navy mark would disappear on it.
    return (
      <span
        aria-hidden
        className="size-[7px] rotate-45 border-[1.5px] border-current opacity-70"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-[7px] rounded-full",
        state === "vod"
          ? "bg-brand-orange"
          : "border-[1.5px] border-brand-orange",
      )}
    />
  );
}

const MARK_LABEL: Record<MarkState, string> = {
  vod: "bestätigt, VOD verlinkt",
  "no-vod": "bestätigt, VOD fehlt noch",
  candidates: "Kandidaten gewählt, noch nicht bestätigt",
  open: "noch keine Kandidaten",
};

function WeekChip({
  ref,
  week,
  active,
  isCurrent,
  onSelect,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  week: MotwWeek;
  active: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const state = markState(week);
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      title={`Spieltag ${week.round}: ${MARK_LABEL[state]}${
        isCurrent ? " · aktueller Spieltag" : ""
      }`}
      onClick={onSelect}
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
      <Mark state={state} />
    </button>
  );
}
