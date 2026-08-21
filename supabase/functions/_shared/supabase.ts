// The two clients, and the reason they are two.
//
//   callerClient(req)  publishable key + the caller's Authorization header.
//                      Used for exactly one thing: auth.getUser(). This is what
//                      proves who is calling.
//
//   serviceClient()    secret key. Bypasses RLS completely. Data access only.
//
// Never use serviceClient() to answer "who is calling?" — it will happily read
// any row for anyone. There is deliberately no generic createClient() export, so
// a later ticket has no ambiguous third option to reach for.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AdminRecord, AuthDeps } from "./auth.ts";

/**
 * Read the first of `names` that is set.
 *
 * Two names per key because of D-39: the project uses the current publishable /
 * secret naming, while the Edge runtime has historically injected the legacy
 * anon / service_role variables. Preferring the current name and falling back
 * keeps us correct either way, and the fallback drops out once the runtime is
 * confirmed to inject the new names.
 */
function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(" or ")}`);
}

function projectUrl(): string {
  return requireEnv("SUPABASE_URL");
}

/** Caller-scoped. Cannot see past RLS, which is the point. */
export function callerClient(req: Request): SupabaseClient {
  return createClient(
    projectUrl(),
    requireEnv("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Full access. Every constraint RLS would apply is bypassed here. */
export function serviceClient(): SupabaseClient {
  return createClient(
    projectUrl(),
    requireEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** The real lookups behind requireAdmin. Wired in each function's index.ts. */
export function realAuthDeps(): AuthDeps {
  return {
    async getUserId(req: Request): Promise<string | null> {
      const { data, error } = await callerClient(req).auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    },

    async getAdmin(userId: string): Promise<AdminRecord | null> {
      const { data, error } = await serviceClient()
        .from("admins")
        .select("name, active")
        .eq("user_id", userId)
        .maybeSingle();

      // A failed read is not the same as "no row". Throwing surfaces it as
      // internal_error rather than telling a real supervisor they are not staff.
      if (error) throw new Error(`admins lookup failed: ${error.message}`);
      if (!data) return null;

      return { name: data.name as string, active: data.active as boolean };
    },
  };
}
