import type { SupabaseClient } from "@supabase/supabase-js";
import { signPhotoUrls } from "@/lib/photos";

// Yes / Pass / connection requests on a match report (PRD: Users and core flow,
// steps 9-10). A "yes" or "pass" stays private. A "request" is shown to the other
// side on purpose, so they can accept it. When both sides want to meet ("yes" or
// "request"), the two are connected, and only then are names revealed.

export const DECISIONS = ["yes", "pass", "request"] as const;
export type Decision = (typeof DECISIONS)[number];
export type DecisionRow = { user_id: string; decision: Decision };

// Seed members are synthetic, so the app answers for them: yes when the Judge
// scored the match at least this high and the chat didn't end on a dealbreaker.
export const SEED_YES_SCORE = 60;

export const wantsToMeet = (d: Decision | null | undefined) => d === "yes" || d === "request";

export function isConnected(mine: Decision | null | undefined, theirs: Decision | null | undefined) {
  return wantsToMeet(mine) && wantsToMeet(theirs);
}

export type DecisionState = {
  mine: Decision | null;
  // Only a connection request is visible before a match; their yes or pass is not.
  theyRequested: boolean;
  connected: boolean;
};

export function decisionState(rows: DecisionRow[], userId: string): DecisionState {
  const mine = rows.find((r) => r.user_id === userId)?.decision ?? null;
  const theirs = rows.find((r) => r.user_id !== userId)?.decision ?? null;
  return { mine, theyRequested: theirs === "request", connected: isConnected(mine, theirs) };
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

function ageOf(birthdate: string | null) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

// Reads other people's real profiles and photos, which row-level security hides
// from the browser. Pass the admin client, and call this only for users you've
// checked with isConnected.
export async function loadRevealedProfiles(admin: SupabaseClient, userIds: string[]) {
  const { data } = await admin
    .from("profiles")
    .select("user_id, display_name, birthdate, city, is_seed, photos")
    .in("user_id", userIds);
  const rows = data ?? [];
  const urls = await signPhotoUrls(admin, rows.flatMap((p) => (p.photos ?? []) as string[]));
  const urlByPath = new Map(rows.flatMap((p) => (p.photos ?? []) as string[]).map((path, i) => [path, urls[i]]));
  return new Map<string, RevealedProfile>(
    rows.map((p) => [
      p.user_id,
      {
        userId: p.user_id,
        name: p.display_name ?? "Your match",
        age: ageOf(p.birthdate),
        city: p.city,
        isSeed: Boolean(p.is_seed),
        photoUrls: ((p.photos ?? []) as string[]).flatMap((path) => urlByPath.get(path) ?? []),
      },
    ]),
  );
}
