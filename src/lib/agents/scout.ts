import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { interestFit, readInterests, type Interest } from "@/lib/interests";
import { cityFits } from "@/lib/matches";
import { isInterestedIn } from "@/lib/profile-topics";

// The Scout (PRD: Agent architecture). Hard filters run in code: mutual gender
// preference, both age ranges, compatible goals, same city, a built twin, and no
// earlier conversation. Claude then ranks whoever is left. Needs the admin client:
// it reads other users' profiles. Names never go to the model.

const client = new Anthropic();
// Sonnet: about half the cost of Opus; quality holds for this job at the effort set below.
const MODEL = "claude-sonnet-5-5";

type Profile = {
  user_id: string;
  birthdate: string;
  gender: string;
  seeking: string[];
  age_min: number;
  age_max: number;
  city: string;
  goal: string;
  is_seed: boolean;
};

const PickSchema = z.object({
  picks: z
    .array(
      z.object({
        candidate: z.number().int().describe("The candidate's number"),
        reason: z.string().describe("One sentence on why this could be a good match"),
      }),
    )
    .describe("The most promising candidates, best first"),
});

function ageOf(birthdate: string) {
  const b = new Date(birthdate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

const goalsFit = (a: string, b: string) => a === b || a === "open" || b === "open";

async function describe(admin: SupabaseClient, userIds: string[]) {
  const [{ data: answers }, { data: cards }] = await Promise.all([
    admin.from("profile_answers").select("user_id, topic, answer").in("user_id", userIds),
    admin
      .from("persona_cards")
      .select("user_id, version, card_json")
      .in("user_id", userIds)
      .order("version", { ascending: false }),
  ]);
  return new Map(
    userIds.map((id) => [
      id,
      {
        answers: Object.fromEntries(
          (answers ?? [])
            .filter((a) => a.user_id === id)
            .map((a) => [a.topic.replace(/^note:/, ""), a.answer]),
        ),
        highlights: (cards ?? []).find((c) => c.user_id === id)?.card_json?.highlights ?? [],
      },
    ]),
  );
}

// Interests by user. Empty if the column doesn't exist yet (migration 0017).
async function loadInterests(admin: SupabaseClient, userIds: string[]) {
  const { data } = await admin.from("profiles").select("user_id, interests").in("user_id", userIds);
  return new Map<string, Interest[]>((data ?? []).map((p) => [p.user_id, readInterests(p.interests)]));
}

export async function scoutMatches(admin: SupabaseClient, userId: string, limit = 1) {
  const { data: me } = await admin
    .from("profiles")
    .select("user_id, birthdate, gender, seeking, age_min, age_max, city, goal, is_seed")
    .eq("user_id", userId)
    .single<Profile>();
  if (!me) throw new Error("Profile not found.");
  const myAge = ageOf(me.birthdate);

  const [{ data: pool }, { data: past }, { data: built }] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, birthdate, gender, seeking, age_min, age_max, city, goal, is_seed")
      .eq("onboarding_complete", true)
      .neq("user_id", userId)
      .returns<Profile[]>(),
    admin
      .from("conversations")
      .select("user_a, user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`),
    admin.from("persona_cards").select("user_id"),
  ]);
  const met = new Set((past ?? []).flatMap((c) => [c.user_a, c.user_b]));
  const hasTwin = new Set((built ?? []).map((p) => p.user_id));

  const candidates = (pool ?? []).filter((p) => {
    const age = ageOf(p.birthdate);
    return (
      !met.has(p.user_id) &&
      isInterestedIn(me.seeking, p.gender) &&
      isInterestedIn(p.seeking, me.gender) &&
      cityFits(p, me.city) &&
      hasTwin.has(p.user_id) &&
      age >= me.age_min &&
      age <= me.age_max &&
      myAge >= p.age_min &&
      myAge <= p.age_max &&
      goalsFit(me.goal, p.goal)
    );
  });
  if (candidates.length <= limit) {
    return candidates.map((c) => ({ userId: c.user_id, reason: "Passed all your filters." }));
  }

  const ids = [userId, ...candidates.map((c) => c.user_id)];
  const [info, interests] = await Promise.all([describe(admin, ids), loadInterests(admin, ids)]);
  const mine = interests.get(userId) ?? [];
  const listing = candidates
    .map((c, i) => {
      const fit = interestFit(mine, interests.get(c.user_id) ?? []);
      return JSON.stringify({
        candidate: i + 1,
        age: ageOf(c.birthdate),
        goal: c.goal,
        ...info.get(c.user_id),
        interest_fit: {
          shared: fit.shared,
          user_open_to_trying: fit.aCouldTry,
          candidate_open_to_trying: fit.bCouldTry,
          no_overlap_in: fit.noOverlap,
        },
      });
    })
    .join("\n");

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(PickSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You are the Scout for Twin Date, a dating app. Pick the candidates most worth a first chat with the user. Everyone listed already passes the hard filters (gender, age, goal, city). Prefer candidates whose kids, religion, smoking, relocation and dealbreaker answers don't conflict with the user's, then shared values, lifestyle and interests. interest_fit is worked out from both profiles: shared items are the strongest interest signal, things one person is open to trying are good talking points, and no_overlap_in means they each like different things in that area and neither wants to branch out. Return up to ${limit + 2} picks, best first.`,
    messages: [
      {
        role: "user",
        content: `<user>${JSON.stringify({ age: myAge, goal: me.goal, ...info.get(userId) })}</user>\n\n<candidates>\n${listing}\n</candidates>`,
      },
    ],
  });

  // Fall back to the filter order if the ranking fails or returns nothing usable.
  const picks = response.parsed_output?.picks ?? [];
  const chosen = new Map<string, string>();
  for (const p of picks) {
    const c = candidates[p.candidate - 1];
    if (c && !chosen.has(c.user_id)) chosen.set(c.user_id, p.reason);
  }
  for (const c of candidates) {
    if (chosen.size >= limit) break;
    if (!chosen.has(c.user_id)) chosen.set(c.user_id, "Passed all your filters.");
  }
  return [...chosen].slice(0, limit).map(([id, reason]) => ({ userId: id, reason }));
}
