"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { STREAM_PHOTO } from "../photo";

// Whether a player has a picture for the stream, in the staff workspaces.
// Same idea as the capture-card mark next to it: a shape you can scan down a
// list, not a colour. A thumbnail means there is one, and clicking it shows
// the picture at the size the stream uses; the crossed-out icon means the
// staff still has to ask.

const THUMB_HEIGHT = 26;
const THUMB_WIDTH = Math.round(THUMB_HEIGHT * STREAM_PHOTO.aspect);

export function StreamPhotoMark({
  photoUrl,
  name,
  className,
}: {
  photoUrl: string | null;
  name: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!photoUrl) {
    return (
      <span
        role="img"
        aria-label={`${name}: kein Stream-Foto`}
        title="Kein Stream-Foto"
        className={cn("flex shrink-0", className)}
      >
        <ImageOff
          aria-hidden
          className="size-[18px] text-muted-foreground/50"
        />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        title={`Stream-Foto von ${name} ansehen`}
        aria-label={`Stream-Foto von ${name} ansehen`}
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
        className={cn(
          "relative shrink-0 overflow-hidden rounded-[4px] border border-brand-orange/60 transition-opacity hover:opacity-80",
          className,
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: bucket URL at a fixed thumbnail size */}
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Stream-Foto von {name}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {/* biome-ignore lint/performance/noImgElement: bucket URL in the overlay's proportions */}
            <img
              src={photoUrl}
              alt={`Stream-Foto von ${name}`}
              className="w-[240px] rounded-xl border object-cover"
              style={{ aspectRatio: STREAM_PHOTO.aspect }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
