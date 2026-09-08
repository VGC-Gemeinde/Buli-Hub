"use client";

import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { isAllowedImageType } from "@/lib/image";
import { cn } from "@/lib/utils";
import { removeStreamPhoto, saveStreamPhoto } from "../actions";
import { STREAM_PHOTO } from "../photo";
import { StreamPhotoCropper } from "./stream-photo-cropper";

// The upload card in /profil. Only the players the stream is about to show
// get it (`showStreamPhotoCard`), so the page never asks anyone else for a
// picture of themselves.

// The preview keeps the overlay's proportions, so what the card shows is
// what the stream shows.
const PREVIEW_WIDTH = 116;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH / STREAM_PHOTO.aspect);

export function StreamPhotoCard({ photoUrl }: { photoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(file: File | undefined) {
    setError(null);
    if (!file) {
      return;
    }
    if (!isAllowedImageType(file.type)) {
      setError("Das ist kein Bild. Nimm ein PNG, JPEG oder WebP.");
      return;
    }
    setPicked(file);
  }

  async function save(blob: Blob) {
    setSaving(true);
    setError(null);
    const file = new File([blob], "stream-photo.webp", { type: "image/webp" });
    const result = await saveStreamPhoto(file);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPicked(null);
    router.refresh();
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    const result = await removeStreamPhoto();
    setRemoving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section aria-label="Stream-Foto" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionHeader>Stream-Foto</SectionHeader>
        <div className="flex flex-col gap-2 text-muted-foreground text-sm leading-normal">
          <p>
            Dein Match wird vielleicht im Stream gezeigt. Neben deinem Namen ist
            dort Platz für ein Bild. Du kannst ein Foto von dir nehmen. Wenn dir
            das unangenehm ist, nimm etwas anderes, mit dem du dich
            identifizierst, zum Beispiel ein cooles Bild von deinem
            Lieblingspokémon.
          </p>
          <p>
            Das Bild wird nur im Stream benutzt. Auf der Seite bleibt dein
            Discord-Avatar wie er ist.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Drop target and preview in one: the box always has the shape the
            stream shows, empty or filled. */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xl border bg-muted/40 transition-colors",
            dragging
              ? "border-brand-orange bg-brand-orange/10"
              : "hover:border-brand-orange/60",
          )}
          aria-label={photoUrl ? "Bild ersetzen" : "Bild wählen"}
        >
          {photoUrl ? (
            // biome-ignore lint/performance/noImgElement: bucket URL, sized by the overlay's proportions
            <img
              src={photoUrl}
              alt="Dein Stream-Foto"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-[12px] text-muted-foreground">
              <ImagePlus aria-hidden className="size-6" />
              Bild wählen oder hierher ziehen
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={photoUrl ? "outline" : "default"}
              disabled={saving || removing}
              onClick={() => input.current?.click()}
            >
              {photoUrl ? "Bild ersetzen" : "Bild wählen"}
            </Button>
            {photoUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={saving || removing}
                onClick={remove}
              >
                {removing ? "Wird entfernt…" : "Bild entfernen"}
              </Button>
            ) : null}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {photoUrl
              ? "Beim Ersetzen schneidest du das neue Bild wieder selbst zu."
              : "Nach der Auswahl legst du den Ausschnitt selbst fest."}
          </p>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // Same file twice in a row still fires a change event.
          event.target.value = "";
        }}
      />

      {picked ? (
        <StreamPhotoCropper
          file={picked}
          saving={saving}
          onCancel={() => setPicked(null)}
          onSave={save}
        />
      ) : null}
    </section>
  );
}
