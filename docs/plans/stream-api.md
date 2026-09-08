# Stream API: gespielte Matches für gemeinde-streams

**Status: implementiert** (2026-09-07), noch nicht auf `dev` gepusht. Gegenstück zu `../gemeinde-streams/docs/plans/buli-hub-source.md`. Verifiziert per Unit- und Integrationstests; der Staging-Check mit `curl` folgt nach dem ersten Deploy (`docs/deployment.md` §9).

## Context

Der Stream-Backend (`gemeinde-streams`) zeigt Bundesliga-Matches im Team-Detail-Overlay: zwei Spieler mit Name, Foto, Teamsheet und Spielstand. Heute tippt die Regie das von Hand ab. Der Hub hat alles: Paarung, Ergebnis mit Spielen, beide Teamsheets als OTS, Discord-Identität. Diese Feature gibt es an den Stream weiter, über zwei Lese-Routen mit Shared Secret, nach dem Muster der Job-Routen.

Der Hub bleibt die einzige Quelle der Wahrheit; der Stream liest nur. Keine Schreibrouten.

## Scope

**In:**

- `GET /api/stream/matches`: die aktuelle Saison (`latestWindow`) und alle Matches mit normalem Ergebnis (Best-of-3, `outcome = normal`, Spiele in `match_games`, beide Teamsheets in `team_sheets`). Freilose, Free Wins und Double Losses fehlen: sie haben keine Spiele und keine Teamsheets, im Stream gibt es nichts zu zeigen.
- `GET /api/stream/matches/[matchId]`: ein Match aus dieser Liste mit Teamsheets und Avataren. 404 für alles andere (falsche Saison, ohne normales Ergebnis, unbekannt).
- Auth: `Authorization: Bearer <STREAM_API_SECRET>` über `authorizeBearer` in `src/lib/bearer.ts` (vorher `authorizeJob` in `jobs.ts`; die Funktion war schon generisch, die Job-Route nutzt sie weiter). Eigenes Secret, nicht `JOBS_SECRET`, damit beide Aufrufer getrennt rotieren. 503 ohne Secret, 401 bei falschem.
- Kein Spoilerschutz, kein Embargo (MotW, Aufnahmen): Der Aufrufer ist der Stream, der das Match zeigt; die Route ist nicht öffentlich und nicht vom Browser erreichbar (kein CORS). Das steht als Kommentar an der Route. Beide Embargo-Gründe stehen aber als Flag im Payload (`motw`, `recording`), damit der Stream seine eigenen Aufnahmen markieren kann (`docs/plans/recording-holds.md`).

**Out:**

- Tabellen, Spielplan, Playoffs. Kommen als weitere Routen unter `/api/stream/`, sobald der Stream ein Overlay dafür hat.
- Offene Matches (Live-Cast). Der Stream nutzt dafür seine eigene Quelle.
- Saison-Auswahl. `latestWindow` reicht; ein `?season=` kommt bei Bedarf.
- Ratenbegrenzung. Ein Aufrufer, ein Secret, Aufrufe nur durch Operator-Aktionen.

## Payload

```
GET /api/stream/matches
{
  season: { number: 2, name: "Saison 2" },
  matches: [{
    id, round: 3,
    division: { tier: 1, name: "Division 1" },
    group: { name: "Division 1a", shortName: "1a" },
    playerA: { id, name }, playerB: { id, name },
    games: ["a", "b", "a"],            // Sieger je Spiel in Spielreihenfolge
    platform: "showdown" | "cartridge",
    motw: true | false,
    recording: true | false,           // vom Staff für den Stream zurückgehalten
    reportedAt
  }]
}

GET /api/stream/matches/<id>
{
  ...dasselbe Match,
  playerA: { id, name, photoUrl: string | null, avatarUrl: null },
  playerB: { id, name, photoUrl: string | null, avatarUrl: null },
  sheets: { a: ots, b: ots }
}
```

`name` über `playerName(displayName, username)`. `photoUrl` ist das Bild, das der Spieler selbst für den Stream hochgeladen hat (`docs/plans/stream-photos.md`), oder null; das Overlay zeigt dann seinen Platzhalter. Der Discord-Avatar wird nicht mehr ausgeliefert: `avatarUrl` ist nur noch als Schlüssel vorhanden und immer null, bis `gemeinde-streams` auf `photoUrl` umgestellt ist. Gruppennamen über `subDivisionName` und `subDivisionShortName`.

## Code

- `src/features/stream-api/queries.ts`: `listStreamMatches(windowId)` und `getStreamMatch(windowId, matchId)`. Joins über `matches`, `sub_divisions`, `divisions`, `match_results`, `match_games`, `team_sheets`, `profiles`, `motw_selections`, `recording_holds`. Integrationstest wie `public-league`.
- `src/features/stream-api/to-stream-match.ts`: reine Abbildung der Zeilen auf die Payload (Spielreihenfolge, `"a"`/`"b"` aus `winner_id`, Namen), unit-getestet.
- `src/app/api/stream/matches/route.ts` und `src/app/api/stream/matches/[matchId]/route.ts`: Auth, Saison laden, Query, `Response.json`. `matchId` gegen das UUID-Muster prüfen wie in `teamsheets/queries.ts`, sonst 404.
- `src/features/stream-api/authorize.ts`: `rejectUnauthorized(request)` liefert die 503- oder 401-Antwort oder null; beide Routen rufen es zuerst.
- `src/lib/bearer.ts`: `authorizeBearer` (vorher `jobs.ts`, `authorizeJob`), Job-Route und Test angepasst.
- `.env.example`: `STREAM_API_SECRET` mit Kommentar. `docs/deployment.md`: Secret in §2 und §7 in die Deploy-Befehle, Einrichtung und Check in §9.
- `src/proxy.ts`: nichts zu tun, die Route läuft ohne Session; `supabase.auth.getUser()` ohne Cookie ist ein No-op.

## Tests

- `to-stream-match.test.ts`: Spiele sortiert nach `gameNumber`, Sieger als Seite, Name-Fallback, MotW- und Recording-Flag.
- `queries.integration.test.ts`: Saison mit normalem Ergebnis, Free Win, offenem Match und Freilos; nur das normale Ergebnis erscheint; Detail liefert beide Sheets; fremde Saison 404.
- `bearer.test.ts` (vorher `jobs.test.ts`).

## Delivery

Ein Feature auf `dev`, Staging liefert dem Stream echte Saisondaten zum Entwickeln, dann PR nach `main`.

## Entschieden

- Eigenes `STREAM_API_SECRET` statt `JOBS_SECRET` (2026-09-07). Die Alternativen Google-ID-Token zwischen den Cloud-Run-Diensten und API-Schlüssel in der Datenbank waren für einen Aufrufer zu viel Bewegung.
- Avatar-URL wird mitgegeben; der Stream entscheidet, ob er sie zeigt.
- Nur gespielte Best-of-3 mit beiden Teamsheets.
