import Link from "next/link";

// The one nudge this feature allows: a line in the banner of a match that is
// featured or recorded, shown to the two players when neither the stream nor
// anyone else has a picture of them yet. No card, no todo, no reminder. Who
// actually ends up on stream is not decided here, so nobody gets pushed.
export function StreamPhotoHint() {
  return (
    <p className="w-full text-[13px] text-muted-foreground">
      Für den Stream kannst du ein eigenes Bild hinterlegen.{" "}
      <Link
        href="/profil"
        className="font-semibold text-brand-blue underline underline-offset-[3px] dark:text-white"
      >
        Im Profil hochladen
      </Link>
    </p>
  );
}
