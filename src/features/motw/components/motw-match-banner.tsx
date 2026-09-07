import { Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotwBadge } from "./motw-badge";

// The Match-of-the-Week strip on the match page (design/MATCH-OF-THE-WEEK.md
// §4.1): marks the featured match for every viewer and carries the VOD link
// once it exists — no placeholder here, the overview billboard holds that
// slot. With `notPublic` (a staff member or participant looking at a result
// that is still under embargo) it says so, and why they see it anyway.
// Server-renderable; the spoiler reveal lives inline in ReportSummary.
export function MotwMatchBanner({
  round,
  youtubeUrl,
  notPublic = false,
}: {
  round: number;
  youtubeUrl: string | null;
  notPublic?: boolean;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-4 py-3">
      <MotwBadge label="full" />
      <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.08em]">
        Spieltag {round}
      </span>
      {notPublic ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-orange/60 px-2.5 py-[3px] font-semibold text-[11px] text-brand-orange uppercase tracking-[0.08em]">
          <Lock aria-hidden className="size-3" />
          Noch nicht öffentlich
        </span>
      ) : null}
      {youtubeUrl ? (
        // Wrapped lines align left (DESIGN.md §6): below sm the button gets
        // its own left-aligned line, flush right only on the sm+ one-liner.
        <div className="w-full sm:ml-auto sm:w-auto">
          <Button asChild size="sm">
            <a href={youtubeUrl} target="_blank" rel="noreferrer">
              <Play aria-hidden className="size-3.5 fill-current" />
              Auf YouTube ansehen
            </a>
          </Button>
        </div>
      ) : null}
      {notPublic ? (
        <p className="w-full text-[13px] text-muted-foreground">
          Ergebnis, Replays und Teamsheets werden mit dem VOD veröffentlicht.
          Bis dahin sehen nur Staff und die beiden Spieler das Ergebnis.
        </p>
      ) : null}
    </div>
  );
}
