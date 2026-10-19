import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnPhotoPath, signPhotoUrls } from "@/lib/photos";

// Yes / Pass / connection requests on a match report (PRD: Users and core flow,
// steps 9-10). A "yes" or "pass" stays private. A "request" is shown to the other
// side on purpose, so they can accept it. When both sides want to meet ("yes" or
// "request"), the two are connected, and only then are names revealed.

export const DECISIONS = ["yes", "pass", "request"] as const;
export type Decision = (typeof DECISIONS)[number];
// Seed members are synthetic, so the app answers for them: yes when the Judge
// scored the match at least this high and the chat didn't end on a dealbreaker.
export const SEED_YES_SCORE = 60;

export const wantsToMeet = (d: Decision | null | undefined) => d === "yes" || d === "request";

export type DecisionState = {
  mine: Decision | null;
  // Only a connection request is visible before a match; their yes or pass is not.
  theyRequested: boolean;
  connected: boolean;
};

export const NO_DECISION: DecisionState = { mine: null, theyRequested: false, connected: false };

// Where Yes / Pass stands on each of the user's conversations, by conversation
// id. Row-level security hides the other side's yes or pass, so the database
// works this out (public.decision_states, migration 0007). Pass the signed-in
// user's client, and optionally one conversation id.
export async function loadDecisionStates(supabase: SupabaseClient, conversationId?: string) {
  let query = supabase.rpc("decision_states");
  if (conversationId) query = query.eq("conversation_id", conversationId);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load your decisions: ${error.message}`);
  const rows = (data ?? []) as {
    conversation_id: string;
    mine: Decision | null;
    they_requested: boolean;
    connected: boolean;
  }[];
  return new Map<string, DecisionState>(
    rows.map((r) => [r.conversation_id, { mine: r.mine, theyRequested: r.they_requested, connected: r.connected }]),
  );
}

export type RevealedProfile = {
  userId: string;
  name: string;
  age: number | null;
  city: string | null;
  isSeed: boolean;
  // Signed URLs, main photo first; empty if they haven't added any.
  photoUrls: string[];
};

export function ageOf(birthdate: string | null) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

// Reads other people's real profiles and photos, which row-level security hides
// from the browser. Pass the admin client, and call this only for users you've
// checked are connected (loadDecisionStates). Only photos in each person's own
// folder are signed.
export async function loadRevealedProfiles(admin: SupabaseClient, userIds: string[]) {
  const { data } = await admin
    .from("profiles")
    .select("user_id, display_name, birthdate, city, is_seed, photos")
    .in("user_id", userIds);
  const rows = (data ?? []).map((p) => ({
    ...p,
    photos: ((p.photos ?? []) as string[]).filter((path) => isOwnPhotoPath(p.user_id, path)),
  }));
  const paths = rows.flatMap((p) => p.photos);
  const urls = await signPhotoUrls(admin, paths);
  const urlByPath = new Map(paths.map((path, i) => [path, urls[i]]));
  return new Map<string, RevealedProfile>(
    rows.map((p) => [
      p.user_id,
      {
        userId: p.user_id,
        name: p.display_name ?? "Your match",
        age: ageOf(p.birthdate),
        city: p.city,
        isSeed: Boolean(p.is_seed),
        photoUrls: p.photos.flatMap((path) => urlByPath.get(path) ?? []),
      },
    ]),
  );
}
