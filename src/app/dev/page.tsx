import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { ImpersonationPicker } from "@/features/dev/components/impersonation-picker";
import { listImpersonatableUsers } from "@/features/dev/impersonation/queries";
import { PERSONAS } from "@/features/dev/personas";

// This page queries the database for the impersonation picker, so it must
// never be prerendered: `next build` runs with an unreachable placeholder
// DATABASE_URL (see Dockerfile), and the export would fail with ECONNREFUSED.
// The layout's cookie check already makes the route dynamic at request time;
// this states it at build time, which is when it matters.
export const dynamic = "force-dynamic";

// Gated by src/app/dev/layout.tsx.
export default async function DevPage() {
  const users = await listImpersonatableUsers();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-12">
        <h1 className="text-4xl text-brand-blue dark:text-white">Dev-Tools</h1>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Als Persona anmelden</h2>
          <ul className="flex flex-col gap-2">
            {PERSONAS.map((persona) => (
              <li key={persona.id}>
                {/* Plain <a>: full navigation, no prefetch — a Link prefetch
                    would trigger the login as a side effect. */}
                <a
                  href={`/dev/login?persona=${persona.id}`}
                  className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
                >
                  <span className="font-medium text-sm">{persona.label}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {persona.description}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Als echten Nutzer anmelden</h2>
          <p className="text-[13px] text-muted-foreground">
            Sieht genau das, was diese Person sieht — Saison, Division, Matches.
            Am nützlichsten nach <code>npm run db:clone-prod</code>.
          </p>
          <ImpersonationPicker users={users} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Testdaten</h2>
          {/* Plain <a>: these routes mutate on GET; avoid Link prefetch. */}
          <a
            href="/dev/seed-registrations?count=100"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              100 Anmeldungen erzeugen
            </span>
            <span className="text-[13px] text-muted-foreground">
              Geschlossene Saison mit 100 Test-Spielern → zur Einteilung
            </span>
          </a>
          <a
            href="/dev/seed-registrations?count=100&grouped=1"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              100 Anmeldungen, alle in Gruppen eingeteilt
            </span>
            <span className="text-[13px] text-muted-foreground">
              Platziert + gruppiert, Auf- & Abstieg noch offen → zur Einteilung
            </span>
          </a>
          <a
            href="/dev/seed-registrations?finalize=1"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Ligastruktur + finalisierte Einteilung
            </span>
            <span className="text-[13px] text-muted-foreground">
              7 Divisionen à 2 Gruppen, Division 4 mit 5 Gruppen und
              Gesamttabelle (136 Spieler) → bereit für "Spielplan erstellen"
            </span>
          </a>
          <a
            href="/dev/seed-registrations?schedule=1"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Ligastruktur + laufende Saison
            </span>
            <span className="text-[13px] text-muted-foreground">
              Dieselbe Struktur mit Spielplan + Ergebnissen, Persona angemeldet
              → zum Spieler-Dashboard
            </span>
          </a>
          <a
            href="/dev/seed-registrations?hidden_schedule=1"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Ligastruktur + interner Spielplan
            </span>
            <span className="text-[13px] text-muted-foreground">
              Spielplan erstellt, aber noch nicht veröffentlicht → zum
              Staff-Bereich mit "Pairings veröffentlichen"
            </span>
          </a>
          <a
            href="/dev/seed-registrations?even=1"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Laufende Saison mit gleich großen Gruppen
            </span>
            <span className="text-[13px] text-muted-foreground">
              Zwei Divisionen mit je drei 8er-Gruppen → die Divisionstabelle
              erscheint im Spieler-Dashboard
            </span>
          </a>
          <a
            href="/dev/seed-registrations?ladder=division"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Auf-/Abstieg testen — Gesamttabelle
            </span>
            <span className="text-[13px] text-muted-foreground">
              Drei Divisionen; du landest in der mittleren mit allen Zonen
              (Auf-/Abstieg + Playoffs), entschieden über die Gesamttabelle
            </span>
          </a>
          <a
            href="/dev/seed-registrations?ladder=sub_division"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Auf-/Abstieg testen — Gruppentabelle
            </span>
            <span className="text-[13px] text-muted-foreground">
              Wie oben, aber die mittlere Division entscheidet über die
              Gruppentabelle (Zonen pro Gruppe)
            </span>
          </a>
          <a
            href="/dev/report-results?count=5"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">5 Ergebnisse melden</span>
            <span className="text-[13px] text-muted-foreground">
              Meldet offene Matches der laufenden Saison wie echte Reports —
              inkl. Discord-Post, wenn die drei Channel-IDs gesetzt sind
            </span>
          </a>
          <a
            href="/dev/regelwerk?accept=0"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">
              Regelwerk-Bestätigung zurücksetzen
            </span>
            <span className="text-[13px] text-muted-foreground">
              Löscht deine Bestätigung für die laufende Saison — Erinnerungs-
              und Sperr-Dialog werden wieder erreichbar
            </span>
          </a>
          <a
            href="/dev/clear-registrations"
            className="flex flex-col rounded-lg border px-4 py-2.5 hover:bg-secondary"
          >
            <span className="font-medium text-sm">Testdaten löschen</span>
            <span className="text-[13px] text-muted-foreground">
              Entfernt erzeugte Anmeldungen, Saisons und Fake-Nutzer
            </span>
          </a>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl">Komponenten</h2>
          <Link
            href="/dev/ui"
            className="rounded-lg border px-4 py-2.5 font-medium text-sm hover:bg-secondary"
          >
            UI-Galerie — alle Komponenten-Zustände
          </Link>
        </section>
      </main>
    </div>
  );
}
