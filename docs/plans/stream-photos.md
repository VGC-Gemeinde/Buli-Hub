# Stream-Fotos (das Spielerfoto im Stream-Overlay)

**Status: done** (2026-09-08). Gestaltet in einem Zug, ohne späteren
Design-Pass. Verifiziert per Unit- und Integrationstests, vollem Testlauf,
Produktions-Build und einer geseedeten Saison (Karte im Profil, Zuschnitt,
Staff-Marken, Payload der Stream-API).

Offen bleibt der Folgeschritt im Stream-Repo: `gemeinde-streams` liest
`photoUrl` statt `avatarUrl`, danach fällt `avatarUrl` hier weg.

## Context

Der Stream zeigt jeden Spieler im Team-Detail-Overlay mit einem Foto. Heute
liefert der Hub dafür den Discord-Avatar: ein kleines quadratisches Bild, das
im Overlay in eine hohe Hochkant-Fläche geschnitten wird. Das sieht schlecht
aus, und es ist kein Bild, das der Spieler für den Stream ausgesucht hat.

Betroffen sind zwei Gruppen: die beiden Spieler des Match of the Week und die
Spieler, deren Match der Staff aufnimmt (`docs/plans/recording-holds.md`). Wer
davon wirklich im Stream landet, steht vorher nicht fest, deshalb bekommt
niemand eine laute Erinnerung. Der Staff spricht die Leute an, die er braucht,
und muss dafür sehen können, wer schon ein Foto hat.

**Im Stream-Backend geprüft** (`../gemeinde-streams`):

- Das Overlay (`src/overlays/team-detail-online/component.tsx`) zeichnet das
  Foto in eine Fläche von **420 × 690** mit `object-fit: cover`. Das ist das
  Seitenverhältnis, auf das zugeschnitten werden muss.
- Ohne Foto rendert es bereits einen eigenen Platzhalter (Ring plus
  Silhouette). **Ein fehlendes Bild ist dort ein vorgesehener Zustand**, es
  bricht nichts.
- Sein Zod-Schema (`src/features/buli-hub/client.ts`) verlangt den Schlüssel
  `avatarUrl` als `string | null` und ignoriert unbekannte Felder. Ein neues
  Feld ist also folgenlos, ein entferntes `avatarUrl` würde das Parsen
  brechen. Was daraus folgt, steht unter "Stream-API".

## Zielformat

420 × 690 im Overlay, also **14:23**. Der Zuschnitt exportiert **840 × 1380**
WebP (doppelte Auflösung, damit es auch bei einem hochskalierten Stream
scharf bleibt), Qualität 0.9. Das landet typisch bei 200 bis 400 KB; die
Obergrenze ist 2 MiB.

## Scope

**In:**

- **Upload mit Zuschnitt in `/profil`**, sichtbar nur für die Spieler, die es
  gerade betrifft. Eine Karte "Stream-Foto": der Text weiter unten, das
  aktuelle Bild oder ein leerer Zustand, Datei wählen oder auf die Karte
  ziehen, danach ein Dialog mit festem 14:23-Rahmen, Zoom-Regler und
  Verschieben per Maus oder Finger. Speichern exportiert 840 × 1380. Dazu
  "Bild ersetzen" und "Bild entfernen".
- **Sichtbar wann**: der Spieler ist an einem Match beteiligt, das Match of
  the Week ist oder für eine Aufnahme markiert ist. Dazu jederzeit, solange
  er ein Bild hinterlegt hat, damit er es auch später noch tauschen oder
  löschen kann. Sonst zeigt `/profil` die Karte gar nicht.
- **Stille Hinweise statt Erinnerung**: auf der Match-Seite bekommen die
  beiden Beteiligten eines MotW- oder Aufnahme-Matches eine Zeile im
  bestehenden Banner, die auf `/profil` verlinkt, wenn noch kein Bild
  hinterlegt ist. Kein Dashboard-Todo, keine Karte, kein Discord-Ping.
- **Für den Staff überprüfbar**:
  - `/staff/aufnahmen` (Liste und Picker) und `/staff/motw` (Pick-Panel und
    Kandidatenzeilen) zeigen pro Spieler eine Foto-Marke im Idiom der
    Capture-Card-Marke: ein Miniaturbild, wenn eins da ist, sonst ein
    gedämpftes Icon mit Titel "Kein Stream-Foto". Ein Klick auf die Miniatur
    öffnet das Foto in voller Größe.
  - Der Staff-Panel auf `/spieler/<userId>` zeigt das Foto und kann es
    entfernen. Das ist der einzige Hebel, wenn jemand etwas Unpassendes
    hochlädt, und es gehört dorthin, wo der Staff ohnehin über einen Spieler
    entscheidet.
- **Storage**: Supabase Storage, Bucket `stream-photos`, öffentlich lesbar
  (das Overlay lädt ohne Anmeldung), geschrieben ausschließlich serverseitig.
- **Stream-API**: `playerA`/`playerB` der Detail-Route bekommen `photoUrl`.
  Der Discord-Avatar wird nicht mehr ausgeliefert.
- **Dev-Tooling**: Galerie-Zustände für Karte, Dialog und Staff-Marke; der
  Seed legt für zwei Spieler ein Foto an, damit die Marken und die
  Stream-API lokal Inhalt haben.

**Out:**

- Jede laute Erinnerung: Todo auf dem Dashboard, Warnkarte, Discord-Nachricht.
  Ausdrücklich so gewollt.
- Das Foto in den öffentlichen Ansichten des Hubs. Übersicht, Profil und
  Match-Seite zeigen weiter den Discord-Avatar. Das Stream-Foto ist für den
  Stream.
- Freier Zuschnitt, Drehen, Filter. Ein Rahmen, ein Verhältnis.
- Das Offline-Team-Detail-Overlay. Es hat eine andere Geometrie und wurde
  nicht verlangt.
- Automatisches Löschen am Saisonende. Das Foto gehört dem Spieler, nicht der
  Saison.
- Moderation über das Entfernen hinaus (Freigabe-Workflow, Verlauf).

## Daten

Zwei Spalten auf `profiles`:

```
stream_photo_path        text
stream_photo_updated_at  timestamptz
```

Der Pfad ist `<userId>/<uuid>.webp`. Jeder Upload schreibt ein **neues**
Objekt und löscht danach das alte: ein fester Pfad würde vom CDN und vom
Stream zwischengespeichert und zeigte nach dem Wechsel noch das alte Bild.

Migrationen: eine generierte für die Spalten, eine custom für den Bucket
(`insert into storage.buckets ... on conflict do nothing`, öffentlich,
erlaubte MIME-Typen, Größenlimit). Der Bucket kommt damit über dieselbe
Migrationskette in alle drei Umgebungen, statt in jeder von Hand angelegt zu
werden.

## Storage-Zugriff

- Schreiben und Löschen über einen Supabase-Admin-Client mit
  `SUPABASE_SECRET_KEY`. Der Schlüssel liegt bereits in beiden
  Cloud-Run-Diensten und in CI, es kommt kein Secret dazu. Der Client wird
  aus `src/features/dev/login.ts` nach `src/lib/supabase/admin.ts` gehoben,
  wo ihn beide Seiten nutzen.
- Lesen über die öffentliche URL
  `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/stream-photos/<pfad>`,
  gebaut von einer reinen Funktion.

## Reine Logik — `src/features/stream-photos/photo.ts` (unit-getestet)

- `STREAM_PHOTO`: Zielmaße (840 × 1380), Seitenverhältnis, `MAX_BYTES`.
- `streamPhotoUrl(path)` → öffentliche URL oder null.
- `streamPhotoPath(userId, id)` → Objektpfad, plus die Prüfung, dass ein
  gespeicherter Pfad zum Nutzer gehört (der Server löscht nie fremde Objekte).
- `cropToTarget(natural, zoom, offset)` → der Quellausschnitt, in das Bild
  hineingeklemmt, plus die Abbildung auf die Zielmaße. Das ist die Arithmetik
  hinter dem Zuschnitt-Dialog, wie `scaleToFit` beim Feedback-Upload.
- `showStreamPhotoCard({ isMotwPlayer, isRecordedPlayer, hasPhoto })` → ob
  `/profil` die Karte zeigt. Ein hinterlegtes Bild genügt immer, damit
  niemand sein Bild nicht mehr löschen kann, sobald die Aufnahme durch ist.

Die Bild-Prüfung des Feedback-Uploads (`sniffImageType`, erlaubte Typen)
zieht nach `src/lib/image.ts` um, weil sie jetzt zwei Features bedient; das
Feedback importiert von dort. Serverseitig wird nur nach Magic Bytes und
Bytelänge geprüft, es kommt keine Bildbibliothek dazu: ein falsches
Seitenverhältnis wäre kein Fehler, sondern nur ein schlechteres Bild, und
`object-fit: cover` im Overlay fängt es ab.

## Queries und Actions — `src/features/stream-photos/`

- `queries.ts`: `streamPhotoOf(userId)`, `streamPhotosFor(userIds)` (eine
  Abfrage für die Staff-Listen), `setStreamPhotoPath`, `clearStreamPhotoPath`,
  `streamRelevanceOf(userId)`: nimmt der Spieler an einem MotW-Match oder an
  einem markierten Match der laufenden Saison teil.
- `actions.ts` (jeweils `{ ok } | { ok: false, error }`):
  - `saveStreamPhoto(file)` — nur der Eigentümer, prüft Typ und Größe, lädt
    hoch, schreibt die Spalten, löscht das vorherige Objekt.
  - `removeStreamPhoto()` — der Eigentümer.
  - `removeStreamPhotoFor({ userId })` — staff+, gleiche Wirkung für einen
    anderen Spieler.

Transport ist eine Server Action mit `File`, wie beim Feedback; das
Body-Limit steht dort schon auf 12 MB.

## Views

- `src/features/stream-photos/components/stream-photo-card.tsx` (Profil) und
  `stream-photo-cropper.tsx` (Dialog mit festem Rahmen, Zoom-Regler,
  Verschieben, Vorschau in Overlay-Proportion).
- `stream-photo-mark.tsx`: die Staff-Marke, geteilt von `/staff/aufnahmen`
  und `/staff/motw`.
- Match-Seite: die stille Zeile im MotW- beziehungsweise Aufnahme-Banner.

Alles in den Tokens aus `design/DESIGN.md`, fertig gestaltet, ohne späteren
Design-Pass.

## Stream-API

Stream-Foto und Seiten-Avatar sind zwei getrennte Dinge, und diese Feature
trennt sie vollständig:

- Die Stream-API liefert nur noch das hochgeladene Bild.
  `StreamMatchDetail.playerA/playerB` bekommen `photoUrl: string | null`. Der
  Discord-Avatar ist dort nicht mehr enthalten.
- Der Avatar im Hub bleibt unverändert der Discord-Avatar. Der Upload rührt
  ihn nicht an, und das Stream-Foto taucht in keiner Ansicht des Hubs auf.

`avatarUrl` verschwindet nicht im selben Schritt aus dem Payload, sonst
bricht das Zod-Schema des Streams. Das Feld behält den Schlüssel und ist ab
sofort **immer null**. Reihenfolge: erst liest `gemeinde-streams` `photoUrl`
(als optionales Feld, damit beide Stände laufen), dann deployt der Hub diese
Änderung, dann fällt `avatarUrl` in einem dritten Schritt weg. Kommt der Hub
zuerst, zeigt der Stream so lange seinen Platzhalter. Das ist inhaltlich
richtig, denn den Discord-Avatar soll er ohnehin nicht mehr zeigen.

Die Listenroute bleibt unverändert, sie führt keine Bilder.
`docs/plans/stream-api.md` und das Gegenstück im Stream-Repo werden
nachgezogen.

## Tests

- **Unit** `photo.test.ts`: URL-Bau, Pfadprüfung, `cropToTarget` (Klemmen an
  den Rändern, Zoom, Abbildung auf 840 × 1380), Byte- und Typgrenzen.
- **Unit** `lib/image.test.ts`: der umgezogene Sniffer bleibt abgedeckt.
- **Unit** `stream-api/to-stream-match.test.ts`: `photoUrl` im Payload.
- **Integration** `stream-photos/actions.integration.test.ts` (Storage
  gemockt): Speichern schreibt die Spalten und löscht das alte Objekt,
  Entfernen räumt beides, ein fremder Nutzer wird abgewiesen, staff+ darf.
- **Integration** `stream-api/queries.integration.test.ts`: Foto im Detail.
- **Manuell**: Foto hochladen und zuschneiden, im Staff-Bereich prüfen,
  Payload der Stream-API mit `curl` ansehen, das Bild im lokalen
  Stream-Overlay gegenprüfen.

## Dokumentation

`docs/plans/stream-api.md` (neues Feld), `docs/plans/recording-holds.md` und
`match-of-the-week.md` (der Hinweis für die Beteiligten), `CLAUDE.md`
(Supabase Storage ist ab jetzt in Benutzung), `.env.example` unverändert.

## Entscheidungen

- **Die Karte sieht nur, wen es betrifft.** Wer nie im Stream landet, braucht
  die Frage nach einem Bild von sich nicht gestellt zu bekommen. Wer eins
  hinterlegt hat, sieht die Karte weiter und kann es tauschen oder löschen.
- **Stream-Foto und Avatar sind getrennt.** Der Upload ändert den Avatar im
  Hub nicht, und die Stream-API kennt den Avatar nicht mehr. Ein Bild, das
  jemand für den Stream aussucht, ist etwas anderes als sein Profilbild.
- **Ein neues Objekt pro Upload.** Der Stream und das CDN cachen die URL; ein
  fester Pfad zeigte nach dem Wechsel weiter das alte Bild.
- **Keine Bildbibliothek auf dem Server.** Magic Bytes und Bytelänge reichen;
  Maße durchzusetzen bräuchte native Abhängigkeiten und verhindert nichts,
  was das Overlay nicht ohnehin abfängt.
- **Der Zuschnitt wird selbst gebaut**, ohne neue Abhängigkeit. Der Rahmen
  ist fest, damit entfällt der schwierige Teil einer allgemeinen
  Crop-Bibliothek: fester Ausschnitt, Zoom-Regler statt Pinch, Verschieben
  per Pointer-Events, Export über Canvas. Grob 150 Zeilen plus die
  Arithmetik, die ohnehin getestet wird.

## Der Text auf der Karte

Der Zweck muss ohne Rückfrage klar sein, und niemand soll sich gedrängt
fühlen, ein Foto von sich zu zeigen:

> **Stream-Foto**
>
> Dein Match wird vielleicht im Stream gezeigt. Neben deinem Namen ist dort
> Platz für ein Bild. Du kannst ein Foto von dir nehmen. Wenn dir das
> unangenehm ist, nimm etwas anderes, mit dem du dich identifizierst, zum
> Beispiel ein cooles Bild von deinem Lieblingspokémon.
>
> Das Bild wird nur im Stream benutzt. Auf der Seite bleibt dein
> Discord-Avatar wie er ist.

Im Zuschnitt-Dialog: "Der Stream zeigt das Bild hochkant. Zieh es zurecht und
stell die Größe mit dem Regler ein."

Auf der Match-Seite, für die beiden Beteiligten ohne Bild: "Für den Stream
kannst du ein eigenes Bild hinterlegen." mit dem Link "Im Profil hochladen".
