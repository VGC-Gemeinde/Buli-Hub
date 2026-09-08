import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The service-key client: full access, server only, never handed to a
// browser. Used by the dev persona login (auth admin) and by the stream
// photos (storage). SUPABASE_SECRET_KEY is set in both Cloud Run services
// and in CI, so this works in every environment.

export type AdminClient = SupabaseClient;

export type AdminClientResult =
  | { ok: true; client: AdminClient }
  | { ok: false; error: string };

export function supabaseAdmin(): AdminClientResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY sind nicht gesetzt",
    };
  }
  return {
    ok: true,
    client: createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}
