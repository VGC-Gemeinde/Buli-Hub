import { Lock, Video } from "lucide-react";
import { StreamPhotoHint } from "@/features/stream-photos/components/stream-photo-hint";

// The recording strip on the match page (docs/plans/recording-holds.md): tells
// every viewer that staff record this match for the stream and that the
// result follows afterwards. The MotW banner's anatomy (badge, Spieltag,
// optional not-public chip, explanatory line) in navy instead of orange, so
// the two never read as the same feature. With `notPublic` (staff or a
// participant looking at a result that is still held) it says why they see
// the result anyway. Server-renderable.
export function RecordingBanner({
  round,
  notPublic = false,
  photoHint = false,
}: {
  round: number;
  notPublic?: boolean;
  // A participant of this match who has no stream photo yet.
  photoHint?: boolean;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-xl border border-brand-blue/30 bg-brand-blue/[0.04] px-4 py-3 dark:border-white/25 dark:bg-white/[0.05]">
      <span className="flex items-center gap-2 rounded-md bg-brand-blue px-2.5 py-1 font-bold text-[11px] text-white uppercase leading-none tracking-[0.1em] dark:bg-white dark:text-brand-blue">
        <Video aria-hidden className="size-3.5" />
        Aufnahme
      </span>
      <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.08em]">
        Spieltag {round}
      </span>
      {notPublic ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-blue/50 px-2.5 py-[3px] font-semibold text-[11px] text-brand-blue uppercase tracking-[0.08em] dark:border-white/50 dark:text-white">
          <Lock aria-hidden className="size-3" />
          Noch nicht öffentlich
        </span>
      ) : null}
      <p className="w-full text-[13px] text-muted-foreground">
        {notPublic
          ? "Dieses Match wird für den Stream aufgenommen. Bis der Staff das Ergebnis freigibt, sehen es nur Staff und die beiden Spieler."
          : "Dieses Match wird für den Stream aufgenommen. Das Ergebnis wird veröffentlicht, sobald der Stream vorbei ist."}
      </p>
      {photoHint ? <StreamPhotoHint /> : null}
    </div>
  );
}
