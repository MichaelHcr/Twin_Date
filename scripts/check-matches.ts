// Explains why a user does or doesn't get matches: runs the Scout's hard filters
// one at a time and prints how many people are left after each. Read-only.
//
//   npm run check-matches -- <email or user ID>
//
// Needs SUPABASE_SECRET_KEY in .env.local.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sameCity } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";

type Profile = {
  user_id: string;
  display_name: string | null;
  birthdate: string;
  gender: string;
  seeking: string[];
  age_min: number;
  age_max: number;
  city: string | null;
  goal: string;
  onboarding_complete: boolean;
  is_seed: boolean;
};

async function resolveUser(admin: SupabaseClient, idOrEmail: string) {
  if (!idOrEmail.includes("@")) return idOrEmail;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === idOrEmail.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 1000) throw new Error(`No user with email ${idOrEmail}.`);
  }
}

function ageOf(birthdate: string) {
  const b = new Date(birthdate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

const goalsFit = (a: string, b: string) => a === b || a === "open" || b === "open";

async function main() {
  const who = process.argv[2];
  if (!who) throw new Error("Usage: npm run check-matches -- <email or user ID>");
  const admin = createAdminClient();
  const userId = await resolveUser(admin, who);

  const [{ data: profiles }, { data: cards }, { data: past }] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, display_name, birthdate, gender, seeking, age_min, age_max, city, goal, onboarding_complete, is_seed")
      .returns<Profile[]>(),
    admin.from("persona_cards").select("user_id"),
    admin.from("conversations").select("user_a, user_b").or(`user_a.eq.${userId},user_b.eq.${userId}`),
  ]);
  const me = profiles?.find((p) => p.user_id === userId);
  if (!me) throw new Error("That user has no profile.");
  const myAge = ageOf(me.birthdate);
  const hasTwin = new Set((cards ?? []).map((c) => c.user_id));
  const met = new Set((past ?? []).flatMap((c) => [c.user_a, c.user_b]));

  console.log(`\n${me.display_name}: ${myAge}, ${me.gender}, seeking ${me.seeking.join("/")} aged ${me.age_min}-${me.age_max}, goal ${me.goal}, city "${me.city}"`);
  console.log(`Interview complete: ${me.onboarding_complete}. Twin built: ${hasTwin.has(userId)}.\n`);

  const cityCounts = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.user_id !== userId && p.onboarding_complete) {
      cityCounts.set(p.city ?? "(none)", (cityCounts.get(p.city ?? "(none)") ?? 0) + 1);
    }
  }
  console.log("Other finished profiles by city:", Object.fromEntries(cityCounts));

  // Same order and rules as scoutMatches() in src/lib/agents/scout.ts.
  const steps: [string, (p: Profile) => boolean][] = [
    ["finished onboarding", (p) => p.onboarding_complete],
    [`same city ("${me.city}")`, (p) => sameCity(p.city, me.city)],
    [`is a gender you seek (${me.seeking.join("/")})`, (p) => me.seeking.includes(p.gender)],
    [`seeks your gender (${me.gender})`, (p) => p.seeking.includes(me.gender)],
    [`their age is in your range (${me.age_min}-${me.age_max})`, (p) => ageOf(p.birthdate) >= me.age_min && ageOf(p.birthdate) <= me.age_max],
    [`your age (${myAge}) is in their range`, (p) => myAge >= p.age_min && myAge <= p.age_max],
    [`compatible goal (${me.goal})`, (p) => goalsFit(me.goal, p.goal)],
    ["has a built twin", (p) => hasTwin.has(p.user_id)],
    ["not chatted with you before", (p) => !met.has(p.user_id)],
  ];

  let left = (profiles ?? []).filter((p) => p.user_id !== userId);
  console.log(`\nEveryone else: ${left.length}`);
  for (const [label, keep] of steps) {
    left = left.filter(keep);
    console.log(`  after "${label}": ${left.length}`);
  }
  console.log(`\nMatchable now: ${left.length}${left.length ? ` (${left.filter((p) => p.is_seed).length} seed users)` : ""}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
