import type { User } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { discordIdentityFromUser } from "@/features/auth/identity";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPersona, type Persona, personaToAdminPayload } from "./personas";

export type DevLoginResult = { ok: true } | { ok: false; error: string };

// GoTrue answers some failures with an empty body, which supabase-js surfaces
// as an AuthError whose message is "{}" (or blank). Returned raw, that is what
// the /dev/login routes render — an opaque `{}`. This turns such a response
// into a message that names the most likely cause and keeps any real detail.
function describeAuthError(
  error: { message?: string; status?: number; name?: string },
  action: string,
): string {
  const raw = (error.message ?? "").trim();
  const opaque = raw === "" || raw === "{}" || raw === "[object Object]";
  const status = error.status ? ` (HTTP ${error.status})` : "";
  if (opaque) {
    return (
      `${action} ist fehlgeschlagen${status}: GoTrue hat den Nutzer ` +
      "abgelehnt. Wahrscheinlich ist die auth.users-Zeile kein vollständiges " +
      "Konto (fehlende Bestätigung/Identität) — nur echte oder über die " +
      "Testdaten erzeugte Nutzer lassen sich anmelden."
    );
  }
  return `${action} ist fehlgeschlagen${status}: ${raw}`;
}

/**
 * Signs the current browser session in as an existing auth user: an admin
 * magic link, verified server-side, so no email is ever sent. Shared by
 * persona login and by impersonation of a cloned production user.
 */
export async function establishSession(email: string): Promise<DevLoginResult> {
  const admin = supabaseAdmin();
  if (!admin.ok) {
    return admin;
  }

  const { data, error: linkError } = await admin.client.auth.admin.generateLink(
    {
      type: "magiclink",
      email,
    },
  );
  if (linkError) {
    return { ok: false, error: describeAuthError(linkError, "Magic-Link") };
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) {
    return {
      ok: false,
      error: describeAuthError(verifyError, "Session-Aufbau"),
    };
  }

  return { ok: true };
}

// Signs the current browser session in as a test persona: create-or-update the
// auth user, then establish a session for it. Only reachable through
// /dev/login, which is gated by devToolsEnabled().
export async function loginAsPersona(
  personaId: string,
): Promise<DevLoginResult> {
  const persona = getPersona(personaId);
  if (!persona) {
    return { ok: false, error: `Unbekannte Persona: ${personaId}` };
  }

  const admin = supabaseAdmin();
  if (!admin.ok) {
    return admin;
  }

  const payload = personaToAdminPayload(persona);
  const { error: createError } =
    await admin.client.auth.admin.createUser(payload);
  if (createError) {
    // The persona already exists from an earlier login — refresh its
    // metadata so persona edits take effect without wiping its profile row.
    const rows = await db.execute<{ id: string }>(
      sql`select id from auth.users where email = ${payload.email}`,
    );
    const existingId = rows[0]?.id;
    if (!existingId) {
      return { ok: false, error: createError.message };
    }
    const { error: updateError } = await admin.client.auth.admin.updateUserById(
      existingId,
      { user_metadata: payload.user_metadata },
    );
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  }

  const session = await establishSession(payload.email);
  if (!session.ok) {
    return session;
  }

  await pinPersonaProfile(payload.email, persona);

  return { ok: true };
}

// Personas have fake Discord ids, so their role and identity cannot come from
// a real guild lookup — write them directly and date the sync far into the
// future so getRole's TTL revalidation never overwrites them. Identity is
// derived from the persona metadata via the same mapper as a real session.
async function pinPersonaProfile(email: string, persona: Persona) {
  const rows = await db.execute<{ id: string }>(
    sql`select id from auth.users where email = ${email}`,
  );
  const userId = rows[0]?.id;
  if (!userId) {
    return;
  }
  const identity = discordIdentityFromUser({
    user_metadata: persona.userMetadata,
  } as User);
  const farFuture = new Date("2100-01-01T00:00:00Z");
  const values = {
    role: persona.role,
    roleSyncedAt: farFuture,
    // Membership is pinned the same way (the far-future sync date keeps the
    // TTL revalidation from ever overwriting it). null = never confirmed,
    // so no checked-at either.
    guildMember: persona.guildMember,
    guildMemberCheckedAt: persona.guildMember === null ? null : new Date(),
    displayName: identity.displayName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
  };
  await db
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });
}
