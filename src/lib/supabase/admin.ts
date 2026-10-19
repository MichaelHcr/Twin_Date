import { createClient } from "@supabase/supabase-js";

// Supabase client with the secret key: it bypasses row-level security.
// For server code that acts on behalf of the app rather than a signed-in user
// (twin conversations, ledgers, reports, seed users).
// Only import this from route handlers and scripts, never from a "use client" file,
// and never return what it reads to a browser without checking who is asking.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Add them to .env.local (see .env.example).",
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
