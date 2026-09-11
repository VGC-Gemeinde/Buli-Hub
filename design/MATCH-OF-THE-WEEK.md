# Buli Hub — Match of the Week (design handoff)

Companion to `DESIGN.md` (tokens, fonts, signature elements — all still
valid). This doc is the design pass over the shipped **Match of the Week**
feature (`docs/plans/match-of-the-week.md`). Domain logic (`motw.ts`, queries,
actions, round gating, spoiler semantics) is correct as-is; only views change.
Reference design: project file **"Match of the Week.dc.html"** — interactive;
use the spec switchers above frame 01 (Offen / Gemeldet · verdeckt /
Aufgedeckt, VOD an/aus) and frame 04 (Warnung / Dringend) to see all states.
Spoiler-reveal, staff picking, filters and remove/replace are clickable.

Design intent in one line: the MotW is the league's **one editorial moment**
per week — it gets a broadcast-style billboard, everything else in the feature
stays quiet, spoiler-safe utility.

---

## 1. Shared pieces

### 1.1 MotW badge (`motw-badge.tsx`)

One pill, used in match rows, the match-page banner and the staff manager:

```
inline-flex items-center gap-1.5 rounded-full
border border-brand-orange/50 bg-brand-orange/12
px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.08em]
```

- Leading element: skewed tick `h-1.5 w-3 -skew-x-[18deg] bg-brand-orange`.
- Text color `#9a4b00` (readable orange-brown on the tinted fill; in dark mode
  use `text-brand-orange`). Label **MOTW** in compact contexts (match rows),
  **Match of the Week** where space allows (banner) — the .dc.html has a
  `badgeStil` tweak comparing both; compact is the default.
- Always carries `title="Ergebnis verdeckt — Match of the Week"` when it
  replaces a score.

### 1.2 Buttons on orange

Primary/orange buttons are **white text** (`text-white`), per production.
This applies to every YouTube CTA, VOD **Speichern**, and the urgent todo's
**Jetzt wählen** below.

## 2. Public overview — the billboard (`motw-block.tsx`)

Replaces the tinted-card block with a **dark navy billboard**, the only dark
panel on the page. Placement unchanged: directly under the title row, **above
the division switcher**. It features the **most recently confirmed** Match of
the Week (`billboardSelection`), so while a new Spieltag runs undecided the
block carries the previous week and switches the moment staff confirm
(`docs/plans/motw-candidates.md`). The eyebrow's **Spieltag {n}** is what says
which week is on screen.

Container: `relative overflow-hidden rounded-xl bg-brand-blue text-white`,
with the two signature elements inside:

- 3px `bg-brand-orange` strip flush at the top of the card.
- Logo watermark: `absolute -right-[70px] -bottom-[60px] w-[320px]
  rotate-[-10deg] opacity-[0.08] rounded-[36px] pointer-events-none`.

Content column `gap-6 px-8 py-6` (26/32/24 in the reference), three rows:

### 2.1 Header row

- Orange tick (`h-2.5 w-5 -skew-x-[18deg] bg-brand-orange`) + heading
  **Match of the Week** — `font-heading 25px uppercase tracking-[0.04em]
  text-white` (never translated).
- Eyebrow beside it, baseline-aligned: **Spieltag {n} · {groupName}** —
  12px semibold uppercase `tracking-[0.14em] text-white/60`. No season label
  (the page title row already carries it).

### 2.2 Matchup row — `grid grid-cols-[1fr_auto_1fr] items-center gap-6`

- **Player side**: avatar `size-[50px]` (fallback: `bg-white/10 border
  border-white/22`), then a column: name in `font-heading 32px uppercase
  leading-[1.02] text-white` + sub-line **Platz {rank}** (the player's
  current standing) 12px `font-medium text-white/55`. Right side mirrored
  (right-aligned, avatar outside).
- **Center state box** — fixed footprint so state changes never relayout the
  card: `flex h-[74px] min-w-[190px] flex-col items-center justify-center
  gap-[7px]`. Four states (`docs/plans/motw-result-embargo.md` decides which
  viewer gets which before the VOD):
  1. **Unplayed** (`!match.reported`): pill **Läuft diese Woche**
     (`rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-[12px]
     font-semibold uppercase tracking-[0.1em]`) + caption **Best of 3**
     (11.5px `text-white/55`).
  2. **Reported, withheld** (no VOD yet, public viewer): pill in the reveal
     button's outline family — `rounded-full bg-white/8 border
     border-brand-orange/65 px-4 py-1.5 text-[12px] font-semibold uppercase
     tracking-[0.1em]` with a leading lock icon (14px, orange), label
     **Ergebnis folgt mit dem VOD**; nothing to click. Caption **Gespielt ·
     Best of 3**.
  3. **Reported, covered** (VOD live, or staff/participant before it): reveal
     button — `rounded-[10px] bg-white/8 border border-brand-orange/65 px-5
     py-[11px] text-sm font-semibold text-white` with a leading eye icon
     (16px, orange stroke), label **Ergebnis aufdecken**; hover
     `bg-brand-orange/18`. Caption: **Spoiler-Schutz: erst das VOD ansehen**;
     before the VOD (staff/participant preview) a lock icon (12px, orange) +
     **Noch nicht öffentlich, erst mit dem VOD**.
  4. **Revealed** (client-side `useState`, as shipped): score
     `font-heading 46px tabular-nums` **2 : 1** + caption
     **Best of 3 · gemeldet**, or **Best of 3 · noch nicht öffentlich** in
     the preview.
- Captions live inside the fixed box; the reveal button sits exactly where
  the score appears.

### 2.3 Footer row — `flex items-center gap-3.5`

- **VOD present**: primary button `bg-brand-orange text-white rounded-lg
  px-[18px] py-[9px] text-sm font-semibold` with a filled play triangle
  (14px), label **Auf YouTube ansehen**; hover a step lighter (`#ff8d24`).
- **VOD missing**: ghost placeholder in the *same footprint* — `border
  border-dashed border-white/35 text-white/55 rounded-lg px-[18px] py-2
  text-sm font-medium`, muted play icon, label **VOD folgt** (no timing
  claim). The slot never collapses; when the link lands, only the fill
  changes.
- Right, `ml-auto`: **Zum Match →** link, 13.5px `text-white/70`,
  hover `text-white`.

## 3. Match rows — badge instead of score (`public-league.tsx`)

In the Spielplan list (current *and* past rounds, permanently):

- The MotW row keeps the standard row anatomy but swaps the center score for
  the **MOTW badge** (§1.1) and gets a quiet highlight: `border
  border-brand-orange/50 bg-brand-orange/[0.045]` instead of the default
  border.
- **Both names stay `font-medium`** — winner bolding would leak the result.
  (Ordinary reported rows keep bolding the winner as shipped.)
- No other change; unplayed and reported rows around it are untouched.

## 4. Match page (`motw-match-banner.tsx`, `motw-spoiler.tsx`)

Order on `/match/[matchId]` stays as shipped: banner first, then spoiler or
summary. Neutral viewers only — participants and staff see everything as
today.

### 4.1 Banner — every viewer

`rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-4 py-3`,
`flex flex-wrap items-center gap-x-3.5 gap-y-2.5`:

- MOTW badge (§1.1) + **Spieltag {n}** (12px semibold uppercase
  tracking-[0.08em] muted).
- **Noch nicht öffentlich** chip, only for a staff member or participant
  looking at a result that is still under embargo (no VOD yet): `rounded-full
  border border-brand-orange/60 px-2.5 py-[3px] text-[11px] font-semibold
  uppercase tracking-[0.08em] text-brand-orange` with a leading lock icon
  (12px). A full-width line below the row (13px muted) explains: "Ergebnis,
  Replays und Teamsheets werden mit dem VOD veröffentlicht. Bis dahin sehen
  nur Staff und die beiden Spieler das Ergebnis."
- `ml-auto`: YouTube button (orange, white text, play icon, `size sm`) once
  the link exists; nothing otherwise (the page has no stable slot to hold —
  the billboard carries the placeholder).

A public viewer meets the embargoed match on the neutral result-less page
(`public-match-view.tsx`) in its **played** state: chip **Gespielt** in a
brand-blue tint (`bg-brand-blue/10 text-brand-blue`) instead of the grey
**Offen**, sub-line **Ergebnis folgt mit dem VOD**, and the informational card
**Ergebnis folgt mit dem VOD**.

### 4.2 Spoiler cover

Layout as shipped (back link → kicker → pairing `h1`), cover card restyled to
match the banner family: `rounded-xl border border-brand-orange/40
bg-brand-orange/5 px-6 py-5`, `flex flex-col items-start gap-3`:

- **Ergebnis versteckt** — 14px semibold.
- Copy, 14px muted: "Dieses Match ist das Match of the Week — das Ergebnis
  bleibt verdeckt, damit dir das Video nicht gespoilert wird."
- Outline button `border-brand-orange/50` **Ergebnis anzeigen**.

### 4.3 Revealed state

Renders the normal neutral `ReportSummary` (no changes there), plus one
addition: a **Wieder verdecken** text link (12.5px muted, underlined),
right-aligned on the kicker row (`ml-auto`), which flips the spoiler state
back. Reveal state stays client-only — a courtesy tag, not security.

## 5. Staff — `/staff/motw` workspace (`motw-manager.tsx`)

One Spieltag at a time across the full page (container **1040px**, the
sanctioned wide width, `DESIGN.md` §8.5), paged through the whole season. Which
weeks are editable is a domain rule, not a view decision — see §5.6.
Header: standard `SiteHeader` breadcrumb **Staff-Bereich / Match of the
Week**. Page head: back link **← Staff-Bereich**, orange tick + `h1`
**Match of the Week** (30px), intro line 14px muted naming the two steps the
workspace has: per week a Hauptmatch plus backups are nominated (all held like
recordings), and one of them is confirmed as the Match of the Week, until when
the billboard keeps the previous week.

The workspace opens on the round that needs work (`initialMotwRound`);
`?spieltag=n` overrides it, which is how the dashboard todo deep-links.

### 5.1 Season pager (`motw-week-pager.tsx`)

`w-fit max-w-full` so the chevrons stay next to the strip in a short season and
a long one fills the width and scrolls. Outline icon buttons **‹ ›** flank a
horizontally scrolling chip row; the open week is scrolled into view.

Chip `w-[42px] flex-col items-center gap-1.5 rounded-lg border py-1.5`: round
number (13px semibold tabular) over a state mark. The marks are **shapes**, not
colors, and a legend line below the strip (11.5px muted) spells them out:

| State | Mark |
|---|---|
| Bestätigt · VOD da | filled `size-[7px]` orange dot |
| Bestätigt · VOD fehlt | `border-[1.5px]` orange ring |
| Kandidaten · nicht bestätigt | `size-[7px] rotate-45 border-[1.5px] border-current` diamond |
| Offen | `h-[2px] w-2.5` dash at 30% |

The diamond inherits the chip's color rather than taking navy: the open chip is
navy itself, and a navy mark would disappear on it.

Open week: `border-brand-blue bg-brand-blue text-white`. Current Spieltag:
`border-brand-orange/70`, or `ring-2 ring-brand-orange ring-offset-2` when it is
also the open one. Each chip carries a `title` naming its state.

This strip replaced the former "Frühere Spieltage" list — the VOD-fehlt ring and
the undecided diamond are what surface those open tasks, without a second list
to work through.

### 5.2 Week head

Hand-rolled to `SectionHeader` anatomy (tick M + 24px condensed `h2` +
`border-b pb-3`) so the state chip can sit beside the title: **Spieltag {n}** +
11px bold uppercase pill — **Aktuelle Woche** loud
(`border-brand-orange/50 bg-brand-orange/12 text-[#9a4b00]`), **Kommende
Woche** / **Vergangen** neutral. Dates right-aligned, 13px muted tabular. A past
week's tick is `neutral`, not orange.

### 5.3 Confirmed panel (`motw-manager.tsx`)

`rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-6 py-5`, the
billboard's broadcast anatomy at reading scale so the staff view and the public
block read as the same object:

- Meta row: **Bestätigt** badge (§1.1) · `DIV 2C` · `gemeldet` chip when
  reported · `nicht aufnehmbar` chip when neither player has a capture card ·
  **Zum Match →** at `ml-auto`.
- Matchup `grid-cols-[1fr_auto_1fr]`, `mx-auto max-w-[640px]` — at full panel
  width the avatars strand themselves at the edges and it stops reading as one
  unit. Names `font-heading` 22px uppercase, `PlayerLink`ed.
- VOD field above a `border-brand-orange/25` divider (§5.5).
- Actions (editable weeks only): outline **Anderes Match bestätigen** (label
  flips to **Auswahl schließen**) and outline **Bestätigung aufheben** in
  destructive text, whose `title` says what happens: the match stays withheld
  as a backup and is released under Aufnahmen. A settled past week shows
  "Vergangene Spieltage lassen sich nicht mehr umbestätigen. Nur der VOD-Link
  bleibt änderbar." instead.

### 5.3a Kandidaten panel (`motw-candidate-panel.tsx`)

The nominated matches of the week, in **navy, not orange**: a candidate is a
recording, and orange stays reserved for the confirmed Match of the Week.
Container `rounded-xl border bg-muted/25 px-6 py-5`, head: navy tick pill
**Kandidaten** (**Weitere Kandidaten** once the week is confirmed) · count ·
outline **Kandidat hinzufügen** at `ml-auto`, which opens the picker.

**Each candidate is a small pick panel**, not a list row: the confirmed panel's
anatomy (§5.3) at list scale, in a `rounded-lg border px-4 py-3` card with
`gap-3`. The Hauptmatch carries the navy edge and tint
(`border-brand-blue/45 bg-brand-blue/[0.04]`), the backups the plain border.

1. **Meta line**: role chip · `DIV 1A` · the row marker (§5.4) · **Zum Match →**
   at `ml-auto`. The role chip is static, never a control: **Hauptmatch** as a
   navy fill with a filled `Star`, **Backup** as an outlined muted pill.
   Promoting is a labelled button below — a chip that is clickable on some rows
   and inert on others is the worse affordance.
2. **Matchup**: `grid-cols-[1fr_auto_1fr]`, `mx-auto max-w-[640px]`, players at
   `MotwSide` size `sm`, centered **vs.** — capped for the same reason as the
   confirmed panel.
3. **Action bar**: `border-t pt-3`, `flex flex-wrap gap-2` — filled orange
   **✓ Bestätigen** (the decision this panel exists for), outline **★ Zum
   Hauptmatch** on backups only, and outline **Entfernen** in destructive text
   pushed to `sm:ml-auto`, away from the two constructive ones. Its `title`
   says what it does not do: the match stays withheld for the stream.

The actions get their own line on purpose. Sharing the picker's trailing cell
with them left three controls fighting over 236px, wrapped across two lines and
with the two secondary ones as ghost buttons that did not read as buttons at
all. A settled week (not `editable`) drops the bar and the cards are pure
information.

**No confirmation yet**: one line above the panel —
`emphasisSurface("destructive")` once the Spieltag is over ("Dieser Spieltag ist
vorbei. Bitte bestätigen, welches Match das Match of the Week war. Bis dahin
wird weiter das Match der Vorwoche beworben."), quiet `border bg-muted/40`
while it runs.

**Nothing at all**: the same two surfaces, with the empty-state copy (running
week without candidates = destructive, a missed past week says it can still be
backfilled) above an open picker.

### 5.4 Picker (`motw-option-row.tsx`, `motw-player.tsx`)

Toolbar, left: the **division** filter — **Alle** · a 1px `bg-border` divider ·
**Division 1 … Division n**. The division chips **combine** (they are not
one-at-a-time), the top two divisions come preselected, and **Alle** is a
select-all/clear-all toggle that reads active only when every division is
selected. Filtering by division rather than sub-division keeps the row to one
line in a seven-division league.

Right: a `fieldset` segmented control carrying a **Sortierung** micro-label
(11px semibold uppercase `tracking-[0.12em]` muted, `aria-hidden` — the
`sr-only` legend already names the group) plus **Division / Platzierung** (best
combined placement first), and separately a **Nur aufnehmbar** toggle, shown
only when the round actually has unrecordable pairings. The label sits *inside*
the pill: without it the two sort options and the filter chip read as three
chips of the same kind.

Every active chip and sort segment is **solid `bg-brand-orange` with white
`font-semibold` text** — orange is the "active" surface (§8.1/§8.2), and 12.5px
on solid orange needs the weight. Inactive chips stay outlined and muted. The
pager's open-week chip is the deliberate exception and stays navy: there orange
already means "aktueller Spieltag".

Below the toolbar a count line "{n} von {m} Matches". The list scrolls with the
page — a nested scroll area fights the filters that make the list short in the
first place. With nothing selected the list reads "Keine Division ausgewählt."

Row = one `<button>` (working through a week means scanning; hunting a small
trailing button per row is the slow way), `grid-cols-[60px_1fr_auto_1fr_236px]`.
The
trailing column is **fixed, not `auto`** — markers appear on some rows only and
an `auto` width would shift the avatar columns row to row.

- Group label (11px semibold uppercase muted).
- Both players mirrored around a centered **vs.**: avatars outside, names
  meeting in the middle, so the two placement chips of a matchup sit next to
  each other and scan straight down the list. Name 16px semibold; below it
  `#{rank}` in a `rounded-md bg-muted` bold tabular chip and the `4–1` record
  (both 15px, 16px in the confirmed panel), then the capture-card mark. No game
  differential — table detail that does not change which matchup is worth
  featuring, and it crowded the line.
- **Capture card**, three states as three *shapes*, never color alone, each
  with an `aria-label`/`title`: `Video` brand-orange = has one, `VideoOff`
  muted = answered no, **`CircleHelp` orange = profile never filled in**, so
  the stored `false` is a default rather than an answer. This is the per-player
  answer to "who do I have to ask?".
- **One marker per row**, most important first — recordability decides the
  pick, "already played" is context, and two chips of different weights side by
  side read as clutter. All three share one outlined pill so the row never
  looks assembled from spare parts: **nicht aufnehmbar**
  (`border-destructive/45 text-destructive`), **Capture Card unklar**
  (`border-brand-orange/55`, at least one profile untouched), **gemeldet**
  (`border-border` muted).
- Trailing affordance: bordered, filling `group-hover:bg-brand-orange
  group-hover:text-white` with the row, and labelled with what the click does:
  **Als Hauptmatch** while the week has none, **Als Backup** afterwards, and
  **Bestätigen** once the week is decided or the match is out of reach for a
  hold (reported, or a past Spieltag — the backfill path). A row that is
  already in play is non-interactive and wears its state instead: **✓
  Hauptmatch** / **✓ Backup** in navy (`border-brand-blue/45`, row tinted
  navy), **✓ Bestätigt** in orange (`border-brand-orange/55
  bg-brand-orange/12`, row tinted orange).

Below `sm` the row stacks (group label + markers, then the two player lines,
then the affordance) and all mirroring drops away.

### 5.5 VOD field (`motw-vod-field.tsx`)

Available on every round, past included — uploads lag the Spieltag. With a link
set it collapses to the orange **Auf YouTube ansehen** button (play icon, white
text) + outline **VOD-Link ändern**. Editing shows label **YouTube-VOD** (13px),
input + primary **Speichern** (+ **Abbrechen** when a link already exists), hint
12px muted: "Feld leeren und speichern entfernt den Link." / "Noch kein VOD
verlinkt." — never promise upload timing. While the pick is reported and has
no link, a 13px muted line under the field says what the link does:
"Ergebnis gemeldet, noch nicht öffentlich. Mit dem VOD-Link wird es
veröffentlicht und im Ergebniskanal gepostet."

### 5.6 Which weeks are editable (`canSelectRound`, `canNominate`)

The view never decides this; it renders `week.editable` and asks `canNominate`
per row. Both mirror domain rules enforced in `actions.ts`:

| Week | Confirm / replace / revoke | Nominate | VOD link |
|---|---|---|---|
| Running or later | yes | yes, while the match is unreported | yes |
| Past, unconfirmed | **yes** — a missed week can be backfilled | no | yes |
| Past, confirmed | no | no | yes |

A settled past week is left alone because re-confirming it would flip spoiler
protection back onto an already-public result and make Discord delete and
repost that week's messages. Backfilling a week that was never confirmed has no
such history to disturb. Nominating stops at the running Spieltag for the
recordings reason: a hold set on a finished week would be stale the moment it
is set, and a reported match's result is already public.

## 6. Staff dashboard — todo + entry point (`motw-todo-card.tsx`, `staff/page.tsx`)

Placement as shipped: `SeasonStrip` → todo card → `SaisonDashboard`, gap-4.5.

- **SeasonStrip**: keeps the permanent **Match of the Week** outline button
  (entry point once the todo is gone) — no visual change.
- **Warning** (next round without candidates): `rounded-lg border border-brand-
  orange/40 bg-brand-orange/5 px-5 py-4`, title 14.5px semibold **Kandidaten
  für Spieltag {n} wählen**, sub 13px muted "Der nächste Spieltag hat noch
  keine Kandidaten für das Match of the Week.", trailing outline button
  `border-brand-orange/50` **Jetzt wählen** → `/staff/motw`.
- **Urgent, nominate** (current round without candidates, replaces the
  warning): `border-destructive/45 bg-destructive/5`, title in
  `text-destructive`, sub "Der aktuelle Spieltag läuft noch ohne Kandidaten für
  das Match of the Week.", button primary (orange, **white text**) **Jetzt
  wählen**.
- **Urgent, confirm** (a finished week with candidates and no decision, which
  outranks both): same destructive surface, title **Match of the Week für
  Spieltag {n} bestätigen**, sub "Der Spieltag ist vorbei und die Kandidaten
  sind noch nicht entschieden. Solange wird weiter das Match der Vorwoche
  beworben.", button **Jetzt bestätigen**.
- Purely informational — never blocks pairings or anything else (unchanged).

## 7. Checklist

1. `motw-badge.tsx`: pill per §1.1 (tick, tint, `#9a4b00`, tooltip)
2. `motw-block.tsx`: navy billboard — top strip, watermark, header row,
   matchup grid with Platz sub-lines, fixed-footprint center state box,
   footer with YouTube button / dashed **VOD folgt** placeholder (§2)
3. `public-league.tsx` MatchRow: orange border + tint on MotW rows, no
   winner bolding there (§3)
4. `motw-match-banner.tsx` / `motw-spoiler.tsx`: banner + cover styling,
   **Wieder verdecken** link on the revealed summary (§4)
5. `motw-manager.tsx` + `motw-week-pager.tsx` + `motw-candidate-panel.tsx` +
   `motw-option-row.tsx` + `motw-player.tsx` + `motw-vod-field.tsx`: season
   pager with shape marks, week head chips, Kandidaten panel, confirmed panel,
   picker rows with placement/record/capture card, sort + filters, state
   labels, VOD field (§5)
6. `motw-todo-card.tsx`: variants per §6; orange buttons white text
   throughout (§1.2)
7. `/dev/ui` gallery: billboard (unplayed / covered / revealed ×
   with/without VOD, plus the carried-over week), MotW match row, banner,
   spoiler cover, workspace in six weeks (missed past / settled past /
   undecided past / running confirmed / future nominated / future empty),
   todo in all three variants
8. Verify both modes, `npx biome check --write .`, `npx tsc --noEmit`,
   `npm test -- --run`
