/**
 * The browser's Supabase client.
 *
 * Only the publishable key reaches this file. It is meant to be public — the
 * database is protected by row-level security, not by hiding this string — and
 * `profiles` grants a signed-in user read access to their own row and nothing
 * else. The secret key never appears in client code; it lives in
 * `SUPABASE_SERVICE_ROLE_KEY`, without a `VITE_` prefix, so the bundler cannot
 * pick it up even by accident.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envValue(name: string): string {
  return ((import.meta.env?.[name] as string | undefined) ?? "").trim();
}

export function supabaseUrl(): string {
  return envValue("VITE_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return envValue("VITE_SUPABASE_ANON_KEY");
}

/**
 * Whether accounts are available at all. A deployment with no Supabase
 * configuration still runs — it just offers license keys only, which is what
 * every existing buyer already has.
 */
export function accountsConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

let client: SupabaseClient | null = null;

/** `null` when this deployment has no Supabase project configured. */
export function getSupabase(): SupabaseClient | null {
  if (!accountsConfigured()) return null;
  if (client) return client;

  client = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The app is a single page with no auth callback route, so there is no
      // URL for Supabase to parse a session out of.
      detectSessionInUrl: false,
    },
  });

  return client;
}

/** Tests build their own clients; this lets them start from a clean one. */
export function resetSupabaseClientForTests(): void {
  client = null;
}
