"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { removeStreamPhotoFor } from "@/features/stream-photos/actions";
import { STREAM_PHOTO } from "@/features/stream-photos/photo";
import type { DropCandidate } from "../queries";
import { DropPlayerDialog, UndropButton } from "./drops-section";

// The staff panel on the public player profile — same anatomy as the match
// page's staff panel (navy card, "Nur für Staff sichtbar"). One action: drop
// the player (reason + type-to-confirm), or lift an existing drop.
export function ProfileStaffPanel({
  player,
  dropped,
  dropReason,
  streamPhotoUrl,
}: {
  player: DropCandidate;
  dropped: boolean;
  dropReason: string | null;
  // The picture the stream would use. Staff can look at it here and take it
  // down; that is the whole moderation story (docs/plans/stream-photos.md).
  streamPhotoUrl: string | null;
}) {
  return (
    <section className="mt-12 rounded-xl border border-brand-blue/25 bg-brand-blue/[0.03] px-6 pt-5 pb-2 dark:bg-muted/20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Tick size="m" color="navy" />
          <h2 className="font-bold font-heading text-brand-blue text-xl uppercase tracking-[0.03em] dark:text-white">
            Staff
          </h2>
        </div>
        <span className="font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.12em]">
          Nur für Staff sichtbar
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-brand-blue/10 border-t py-3.5">
        {dropped ? (
          <>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Gedroppt</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {dropReason
                  ? `"${dropReason}" · Aufheben stellt alle Ergebnisse wieder her.`
                  : "Aufheben stellt alle Ergebnisse wieder her."}
              </p>
            </div>
            <UndropButton userId={player.userId} />
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Spieler droppen</p>
              <p className="text-[13px] text-muted-foreground">
                Alle Matches zählen als Freewin (2:0) für die Gegner.
              </p>
            </div>
            <DropPlayerDialog fixed={player} triggerSize="sm" />
          </>
        )}
      </div>
      <StreamPhotoRow userId={player.userId} photoUrl={streamPhotoUrl} />
    </section>
  );
}

function StreamPhotoRow({
  userId,
  photoUrl,
}: {
  userId: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    await removeStreamPhotoFor({ userId });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-4 border-brand-blue/10 border-t py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        {photoUrl ? (
          // biome-ignore lint/performance/noImgElement: bucket URL in the overlay's proportions
          <img
            src={photoUrl}
            alt=""
            style={{ aspectRatio: STREAM_PHOTO.aspect }}
            className="h-[54px] shrink-0 rounded-md border object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="font-semibold text-sm">Stream-Foto</p>
          <p className="text-[13px] text-muted-foreground">
            {photoUrl
              ? "Wird im Stream neben dem Namen gezeigt. Entfernen, wenn es dort nicht hingehört."
              : "Noch kein Bild hinterlegt. Der Stream zeigt dann seinen Platzhalter."}
          </p>
        </div>
      </div>
      {photoUrl ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 text-destructive"
          disabled={pending}
          onClick={remove}
        >
          {pending ? "Wird entfernt…" : "Entfernen"}
        </Button>
      ) : null}
    </div>
  );
}
