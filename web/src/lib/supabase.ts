import { createClient } from "@supabase/supabase-js";

/**
 * The browser's Supabase client.
 *
 * Publishable key only. It is public by design and, with RLS on and zero
 * policies, it can read and write nothing directly — every table is reached
 * through an Edge Function holding the secret key (CLAUDE.md rule 2).
 *
 * This client is used for exactly two things: authentication, and minting the
 * JWT that authorises calls to those functions.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // Loud and immediate. A half-configured client fails later with a vague
  // network error, which is a much worse hour to debug.
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill it in.",
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const functionsBaseUrl = `${url.replace(/\/$/, "")}/functions/v1`;
