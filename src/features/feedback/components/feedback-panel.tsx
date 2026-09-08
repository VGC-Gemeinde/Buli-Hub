"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { ActionLink } from "@/components/links";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ALLOWED_IMAGE_TYPES } from "@/lib/image";
import { cn } from "@/lib/utils";
import { attachmentOutcome, MAX_ATTACHMENTS } from "../attachments";
import { BODY_MAX, type FeedbackKind, TITLE_MAX } from "../feedback";

// The intake form's body, presentational only — every piece of state comes
// from the parent, apart from the transient drag-over highlight. The dialog
// owns the form state and the server call; the gallery renders this directly
// to show each state.

const KINDS: { value: FeedbackKind; title: string; body: string }[] = [
  {
    value: "bug",
    title: "Fehler",
    body: "Etwas funktioniert nicht oder sieht falsch aus.",
  },
  {
    value: "idea",
    title: "Idee",
    body: "Ein Vorschlag, was der Hub zusätzlich können sollte.",
  },
];

// Uppercase micro label (DESIGN.md §8.6).
const MICRO = "font-semibold text-[12px] uppercase tracking-[0.12em]";

// The counter is noise until it matters — it appears on the last stretch.
const COUNTER_FROM = BODY_MAX - 200;

export type Attachment = { id: string; name: string; previewUrl: string };

export type FeedbackSent = {
  threadUrl: string | null;
  attachmentCount: number;
  attachmentsPosted: boolean;
};

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(MICRO, "text-muted-foreground")}>
      {children}
    </label>
  );
}

// Only images, and only what the pasted/dropped payload actually contains.
function imagesFrom(items: FileList | null | undefined): File[] {
  if (!items) {
    return [];
  }
  return Array.from(items).filter((file) => file.type.startsWith("image/"));
}

export function FeedbackPanel({
  canSubmitIdea,
  kind,
  onKindChange,
  title,
  onTitleChange,
  body,
  onBodyChange,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  capturedPath = "/",
  error = null,
  sent = null,
}: {
  canSubmitIdea: boolean;
  kind: FeedbackKind;
  onKindChange: (kind: FeedbackKind) => void;
  title: string;
  onTitleChange: (title: string) => void;
  body: string;
  onBodyChange: (body: string) => void;
  attachments?: Attachment[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  capturedPath?: string;
  error?: string | null;
  sent?: FeedbackSent | null;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (sent) {
    const outcome = attachmentOutcome(
      sent.attachmentCount,
      sent.attachmentsPosted,
    );
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <Tick size="m" className="mt-1.5" />
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] leading-snug">
              Deine Meldung ist angekommen und liegt bei den Organisatoren.
            </p>
            {sent.threadUrl ? (
              <p className="text-[13px] text-muted-foreground">
                Rückfragen laufen über den Discord-Thread.
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Rückfragen kommen bei Bedarf über Discord auf dich zu.
              </p>
            )}
            {outcome ? (
              <p
                className={cn(
                  "text-[13px]",
                  sent.attachmentsPosted
                    ? "text-muted-foreground"
                    : "text-destructive",
                )}
              >
                {outcome}
              </p>
            ) : null}
          </div>
        </div>

        {sent.threadUrl ? (
          <ActionLink href={sent.threadUrl}>Zum Discord-Thread</ActionLink>
        ) : null}
      </div>
    );
  }

  const trimmedBody = body.trim();
  const roomLeft = MAX_ATTACHMENTS - attachments.length;

  function add(files: File[]) {
    if (files.length > 0) {
      onAddFiles?.(files);
    }
  }

  return (
    // Paste is the screenshot gesture (Win+Shift+S, then Ctrl+V), and it has
    // to work wherever the caret happens to be — so it is caught here on the
    // whole panel rather than on one field.
    // biome-ignore lint/a11y/noStaticElementInteractions: a paste/drop surface, not a control — the file picker button is the keyboard path
    <div
      className={cn(
        "flex flex-col gap-5 rounded-lg transition-colors",
        dragging &&
          "outline-2 outline-brand-orange outline-dashed outline-offset-4",
      )}
      onPaste={(event) => {
        const images = imagesFrom(event.clipboardData?.files);
        if (images.length > 0) {
          event.preventDefault();
          add(images);
        }
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        const images = imagesFrom(event.dataTransfer?.files);
        setDragging(false);
        if (images.length > 0) {
          event.preventDefault();
          add(images);
        }
      }}
    >
      {canSubmitIdea ? (
        <RadioGroup
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          value={kind}
          onValueChange={(value) => onKindChange(value as FeedbackKind)}
        >
          {KINDS.map((option) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: the RadioGroupItem is the control
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors",
                "hover:bg-muted/60",
                "has-data-[state=checked]:border-brand-orange has-data-[state=checked]:bg-brand-orange/6 has-data-[state=checked]:hover:bg-brand-orange/6",
              )}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span className="flex flex-col gap-1">
                <span className="font-semibold text-[14px]">
                  {option.title}
                </span>
                <span className="text-[12.5px] text-muted-foreground leading-snug">
                  {option.body}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      ) : null}

      <div className="grid gap-2">
        <FieldLabel htmlFor="feedback-title">Worum geht es?</FieldLabel>
        <Input
          id="feedback-title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={
            kind === "bug"
              ? 'Kurz in einem Satz, z. B. "Spieltag lädt nicht"'
              : 'Kurz in einem Satz, z. B. "Kalender-Export"'
          }
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <FieldLabel htmlFor="feedback-body">Beschreibung</FieldLabel>
          {trimmedBody.length > COUNTER_FROM ? (
            <span
              className={cn(
                "text-[12px] text-muted-foreground tabular-nums",
                trimmedBody.length > BODY_MAX && "text-destructive",
              )}
            >
              {trimmedBody.length}/{BODY_MAX}
            </span>
          ) : null}
        </div>
        {/* The primitive is field-sizing-content, so it grows while typing and
            `rows` does nothing — only the floor is ours to set. 64px would
            invite a one-line report. */}
        <Textarea
          id="feedback-body"
          className="min-h-[124px]"
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={
            kind === "bug"
              ? "Was hast du gemacht, was ist passiert, was hättest du erwartet?"
              : "Was soll der Hub können, und was wird dadurch einfacher?"
          }
        />
      </div>

      {/* Screenshots. The reporter cannot open the staff-server thread, so this
          is the only place they can hand one over. */}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn(MICRO, "text-muted-foreground")}>
            Screenshots
          </span>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {attachments.length}/{MAX_ATTACHMENTS}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group relative size-[68px] overflow-hidden rounded-lg border bg-muted"
            >
              {/* Plain <img>: these are blob: object URLs, which next/image
                  cannot optimise. */}
              {/** biome-ignore lint/performance/noImgElement: object URL preview */}
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="size-full object-cover"
              />
              <button
                type="button"
                aria-label={`${attachment.name} entfernen`}
                onClick={() => onRemoveAttachment?.(attachment.id)}
                className="absolute top-1 right-1 rounded-full bg-background/85 p-0.5 text-foreground/80 hover:bg-background hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {roomLeft > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-[68px] w-[68px] flex-col gap-1 px-0 text-[11px] font-medium text-muted-foreground"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="size-4" />
              Bild
            </Button>
          ) : null}
        </div>

        {/* Picker first: on mobile it is the only route, and "Strg+V" there is
            just noise. */}
        <p className="text-[12px] text-muted-foreground">
          Bild auswählen, hierher ziehen oder mit{" "}
          <kbd className="font-sans font-semibold">Strg</kbd>+
          <kbd className="font-sans font-semibold">V</kbd> einfügen.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => {
            add(imagesFrom(event.target.files));
            // Allow picking the same file again after a removal.
            event.target.value = "";
          }}
        />
      </div>

      {/* Naming the captured context beats a vague "wir schicken etwas mit". */}
      <div className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <Tick size="s" color="neutral" />
          <span className={cn(MICRO, "text-muted-foreground")}>
            Automatisch dabei
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="font-mono text-[12px] text-foreground">
            {capturedPath}
          </span>
          <span className="text-border">·</span>
          <span>Name &amp; Rolle</span>
          <span className="text-border">·</span>
          <span>Spieltag</span>
          <span className="text-border">·</span>
          <span>Browser &amp; Build</span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/[0.06] px-4 py-3 text-[13.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The action bar. Separate from the panel because the dialog pins it below a
 * scrolling body — on a phone the form is taller than the screen, and
 * "Absenden" must not be the thing you have to scroll to find.
 */
export function FeedbackActions({
  sent = false,
  pending = false,
  disabled = false,
  onSubmit,
  onClose,
}: {
  // Only which variant to show — the bar needs nothing from the payload.
  sent?: boolean;
  pending?: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  if (sent) {
    return (
      <DialogFooter className="m-0 shrink-0 rounded-b-xl">
        <Button type="button" className="w-full sm:w-auto" onClick={onClose}>
          Schließen
        </Button>
      </DialogFooter>
    );
  }
  return (
    <DialogFooter className="m-0 shrink-0 rounded-b-xl">
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={onClose}
      >
        Abbrechen
      </Button>
      <Button
        type="button"
        className="w-full sm:w-auto"
        disabled={disabled || pending}
        onClick={onSubmit}
      >
        {pending ? "Wird gesendet…" : "Absenden"}
      </Button>
    </DialogFooter>
  );
}
