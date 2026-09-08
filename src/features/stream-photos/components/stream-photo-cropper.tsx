"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  type CropView,
  clampCropView,
  cropRect,
  initialCropView,
  isLowResolution,
  MAX_ZOOM,
  type Size,
  STREAM_PHOTO,
} from "../photo";

// The crop dialog. The frame is fixed to the shape of the overlay's photo
// area, so there is nothing to choose but the cut itself: drag the picture,
// set the size with the slider. All arithmetic lives in `photo.ts`; this
// drives one <img> and one canvas.

// Frame size on screen. 224 wide keeps the whole dialog under a laptop's
// viewport height while staying big enough to judge a face.
const FRAME_WIDTH = 224;
const FRAME_HEIGHT = Math.round(FRAME_WIDTH / STREAM_PHOTO.aspect);

// The object URL stays alive as long as the dialog does: it is what the
// preview <img> points at, and revoking it while the picture is on screen
// leaves an empty frame. The effect below frees it on close.
function loadImage(
  file: File,
): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden"));
    };
    image.src = url;
  });
}

async function exportCrop(
  image: HTMLImageElement,
  natural: Size,
  view: CropView,
): Promise<Blob> {
  const rect = cropRect(natural, view);
  const canvas = document.createElement("canvas");
  canvas.width = STREAM_PHOTO.width;
  canvas.height = STREAM_PHOTO.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas nicht verfügbar");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    STREAM_PHOTO.width,
    STREAM_PHOTO.height,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) {
    throw new Error("Bild konnte nicht erzeugt werden");
  }
  return blob;
}

export function StreamPhotoCropper({
  file,
  saving,
  onCancel,
  onSave,
}: {
  file: File;
  saving: boolean;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<CropView>({
    zoom: 1,
    centerX: 0,
    centerY: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    loadImage(file)
      .then(({ image: loaded, url }) => {
        objectUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const size = {
          width: loaded.naturalWidth,
          height: loaded.naturalHeight,
        };
        setImage(loaded);
        setNatural(size);
        setView(initialCropView(size));
      })
      .catch(() =>
        setError("Das Bild konnte nicht gelesen werden. Nimm ein anderes."),
      );
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file]);

  const ready = image !== null && natural.width > 0;
  const rect = ready ? cropRect(natural, view) : null;
  // Screen pixels per source pixel: the frame always shows exactly the cut.
  const displayScale = rect ? FRAME_WIDTH / rect.width : 1;

  const move = useCallback(
    (dx: number, dy: number) => {
      setView((current) =>
        clampCropView(natural, {
          ...current,
          centerX: current.centerX - dx / displayScale,
          centerY: current.centerY - dy / displayScale,
        }),
      );
    },
    [natural, displayScale],
  );

  async function save() {
    if (!image) {
      return;
    }
    try {
      onSave(await exportCrop(image, natural, view));
    } catch {
      setError("Der Zuschnitt hat nicht geklappt. Versuch es nochmal.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Bild zuschneiden</DialogTitle>
          <DialogDescription>
            Der Stream zeigt das Bild hochkant. Zieh es zurecht und stell die
            Größe mit dem Regler ein.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* The frame is the picture: what is inside it is exactly what the
              overlay will show, at the overlay's proportions. */}
          <div
            role="application"
            aria-label="Bildausschnitt verschieben"
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) {
                return;
              }
              move(
                event.clientX - drag.current.x,
                event.clientY - drag.current.y,
              );
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
            className={cn(
              "relative touch-none select-none overflow-hidden rounded-xl border-2 border-brand-orange bg-muted",
              ready ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            )}
          >
            {ready && rect ? (
              // biome-ignore lint/performance/noImgElement: a local object URL sized by the crop maths, not a static asset
              <img
                src={image.src}
                alt=""
                draggable={false}
                // An empty frame with no explanation is what a broken preview
                // used to look like; say it instead.
                onError={() =>
                  setError(
                    "Das Bild lässt sich nicht anzeigen. Nimm ein anderes.",
                  )
                }
                style={{
                  position: "absolute",
                  left: -rect.x * displayScale,
                  top: -rect.y * displayScale,
                  width: natural.width * displayScale,
                  height: natural.height * displayScale,
                  maxWidth: "none",
                }}
              />
            ) : (
              <span className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Bild wird geladen…
              </span>
            )}
          </div>

          <div className="flex w-full max-w-[300px] items-center gap-3">
            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
              Größe
            </span>
            <Slider
              value={[view.zoom]}
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              disabled={!ready}
              aria-label="Größe"
              onValueChange={([zoom]) =>
                setView((current) =>
                  clampCropView(natural, { ...current, zoom: zoom ?? 1 }),
                )
              }
            />
          </div>

          {rect && isLowResolution(rect) ? (
            <p className="text-[12.5px] text-muted-foreground">
              Das Bild ist recht klein. Im Stream wirkt es dadurch unscharf.
            </p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Abbrechen
          </Button>
          <Button type="button" disabled={!ready || saving} onClick={save}>
            {saving ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
