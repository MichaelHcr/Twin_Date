// Seeds the matching pool with synthetic users (docs/HANDOFF.md, step 2).
// Each Claude call designs one pair of users: either with a planted dealbreaker
// conflict or genuinely compatible, for the PRD's evaluation. Pairs are saved to
// the seed_pairs table so the Orchestrator and Judge can be scored on them.
//
//   npm run seed -- --dry-run          generate only, save JSON to scripts/output/, no database writes
//   npm run seed                       generate and insert
//   npm run seed -- --from scripts/output/seed-personas.json   insert saved personas, no Claude calls
//   npm run seed -- --reset            delete all existing seed users first
//
// Options: --conflict N (default 10), --compatible N (default 10),
//          --cities "San Francisco,Oakland" (the city or cities your testers are in)
//
// Needs migration 0004 and, in .env.local, SUPABASE_SECRET_KEY and ANTHROPIC_API_KEY.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PersonaSchema } from "@/lib/agents/persona-builder";
import { GENDERS, GOALS, TOPICS } from "@/lib/profile-topics";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "claude-opus-5-5";
const OUTPUT_FILE = "scripts/output/seed-personas.json";
const CONCURRENCY = 4;

// One planted conflict per conflict pair, all on locked topics so a twin may flag them.
// Everything Scout filters on (gender, age, goal, city) still matches, so only the
// conversation can surface the conflict.
const CONFLICTS = [
  "A wants kids in the next few years; B has decided never to have kids.",
  "A has a young child and wants more kids; B never wants kids and lists it as a dealbreaker.",
  "A smokes regularly; B lists smoking as a dealbreaker.",
  "A is devout and wants a partner who shares their faith; B is a firm atheist who isn't open to religion at home.",
  "A will never leave their city (family nearby); B is moving to another country next year for work and wants a partner to come along.",
  "A has two big dogs they adore; B is severely allergic to dogs and lists pets as a dealbreaker.",
  "A is sober and lists heavy drinking as a dealbreaker; B loves going out drinking several nights a week.",
  "A's dealbreaker is a partner with opposite politics (strongly progressive); B is strongly conservative and outspoken about it.",
  "A wants to raise future kids in their religion; B is secular and lists raising kids religious as a dealbreaker.",
  "A wants strict monogamy; B wants an open relationship and says so upfront.",
];

const COMPATIBLE_THEMES = [
  "two outdoorsy people who want to settle down",
  "a homebody and a social butterfly whose values line up",
  "two ambitious career people who agree on kids and money",
  "two creatives (music, art, writing) who both want something long-term",
  "a planner and a spontaneous person who agree on the big things",
  "two foodies who both want kids someday",
  "two people who already have kids and want a blended family",
  "two introverted gamers or readers who want a calm life",
  "two fitness people with aligned lifestyles",
  "two people new to the city looking for something serious",
];

// Gender of A and B for pair i (cycled), so the pool isn't only straight pairs.
const GENDER_PAIRS: [string, string][] = [
  ["woman", "man"],
  ["man", "woman"],
  ["woman", "man"],
  ["woman", "woman"],
  ["man", "woman"],
  ["man", "man"],
  ["woman", "man"],
  ["non-binary", "woman"],
  ["man", "woman"],
  ["woman", "non-binary"],
];

// Names and jobs are assigned in code: left alone, Claude reuses the same few names
// and backstories across separate calls.
const NAMES: Record<string, string[]> = {
  woman: ["Aaliyah", "Bea", "Camila", "Dana", "Esther", "Fatima", "Grace", "Hana", "Imani", "Jules",
    "Keiko", "Leila", "Mónica", "Nadia", "Olga", "Priya", "Rosa", "Sofia", "Tessa", "Valentina"],
  man: ["Andre", "Ben", "Carlos", "Darius", "Ethan", "Felix", "Gabe", "Hiro", "Isaac", "Jamal",
    "Kenji", "Luis", "Marcus", "Nikhil", "Omar", "Pete", "Raf", "Sam", "Tariq", "Victor"],
  "non-binary": ["Ash", "Kai", "Quinn", "River", "Sage", "Robin"],
};
const JOBS = [
  "ER nurse", "high school chemistry teacher", "line cook", "UX designer", "electrician",
  "public defender", "dental hygienist", "data analyst", "firefighter", "graduate student in history",
  "real estate agent", "veterinary tech", "software engineer", "barista and part-time musician",
  "accountant", "physical therapist", "film editor", "union carpenter", "pharmacist",
  "small bakery owner", "social worker", "airline mechanic", "marketing manager", "librarian",
  "personal trainer", "architect", "landscape gardener", "translator", "police dispatcher",
  "tattoo artist", "HR specialist", "middle school counselor", "sommelier", "lab researcher",
  "bike shop owner", "insurance adjuster", "museum educator", "flight attendant", "paralegal",
  "nonprofit fundraiser",
];

const answerShape = Object.fromEntries(
  TOPICS.map((t) => [
    t.key,
    t.options ? z.enum(t.options as [string, ...string[]]) : z.string().describe(t.question),
  ]),
);

const SeedPersonaSchema = z.object({
  display_name: z.string().describe("First name only"),
  age: z.number().int().min(21).max(50),
  gender: z.enum(GENDERS),
  seeking: z.array(z.enum(GENDERS)),
  age_min: z.number().int().min(18),
  age_max: z.number().int().max(99),
  goal: z.enum(GOALS.map((g) => g.value) as [string, ...string[]]),
  answers: z
    .object(answerShape)
    .describe("Profile answers, written by the user in first person, in their own voice"),
  notes: z
    .array(
      z.object({
        topic: z.string().describe("Short snake_case name, e.g. pets, job_field, drinking"),
        answer: z.string(),
        tier: z.enum(["soft", "open"]),
      }),
    )
    .describe("2-4 extra facts a date might ask about"),
  persona: PersonaSchema,
});

const PairSchema = z.object({
  planted: z
    .string()
    .describe("One sentence: the planted conflict, or why these two are compatible"),
  a: SeedPersonaSchema,
  b: SeedPersonaSchema,
});

type SeedPersona = z.infer<typeof SeedPersonaSchema>;
type SeedPair = z.infer<typeof PairSchema> & { kind: "conflict" | "compatible" };

const SYSTEM_PROMPT = `You create realistic synthetic users for testing Twin Date, a dating app where each user's AI twin has first conversations with other users' twins.

For each pair you get a brief. Produce two adults with a full profile, topic answers, a few extra facts, and a persona card.
- Make them specific and different from typical examples: varied jobs, backgrounds, hobbies, humor and texting styles (some all lowercase and bursty, some full sentences, some emoji-heavy, some dry).
- Topic answers are written by the user, first person, in their own voice. Dealbreakers: one per line.
- Persona card: the summary speaks to the user ("you"). style.sample_lines are 5-10 lines this person would really text, in their exact voice. unknowns lists things a date might ask that the profile doesn't cover.
- Fictional people only, no celebrities. Keep everything PG-13.`;

type Assigned = { gender: string; name: string; job: string; age: number };

// Ages are assigned too, mostly 22-35 so student testers find matches; partners are
// within a few years of each other.
function agesFor(i: number): [number, number] {
  const a = 22 + ((i * 5) % 14);
  return [a, a + ((i % 4) - 1)];
}

function pairPrompt(kind: SeedPair["kind"], brief: string, [a, b]: [Assigned, Assigned]) {
  const rules =
    kind === "conflict"
      ? `Plant this dealbreaker conflict: ${brief}
State it plainly in the relevant topic answers or dealbreakers, so a careful conversation finds it. Apart from the conflict, make them appealing to each other (shared interests, similar humor), so the conflict is the real test.`
      : `Make them genuinely compatible: ${brief}.
Their locked topics (kids, religion, smoking, relocation, dealbreakers) must not conflict. Give them one or two minor soft differences (money habits, weekends) so it feels real.`;
  return `${rules}

A is ${a.name}, a ${a.age}-year-old ${a.gender} who works as a ${a.job}. B is ${b.name}, a ${b.age}-year-old ${b.gender} who works as a ${b.job}. Build each person's life, hobbies and voice around who they are; don't default to climbing, board games, sourdough or a pet cat.

Both must pass the app's hard filters: A is a ${a.gender} and B is a ${b.gender}; each one's "seeking" includes the other's gender; each one's age is inside the other's age range; their goals are the same or one is "open".`;
}

// Rules that must hold are enforced in code, not only in the prompt.
function alignPair(pair: SeedPair, city: string) {
  for (const [self, other] of [
    [pair.a, pair.b],
    [pair.b, pair.a],
  ]) {
    if (!self.seeking.includes(other.gender)) self.seeking.push(other.gender);
    // Wide enough to include the partner and people a few years either side.
    self.age_min = Math.max(18, Math.min(self.age_min, other.age, self.age - 4));
    self.age_max = Math.max(self.age_max, other.age, self.age + 4);
  }
  if (pair.a.goal !== pair.b.goal && pair.a.goal !== "open" && pair.b.goal !== "open") {
    pair.b.goal = pair.a.goal;
  }
  return { ...pair, city };
}

async function generatePairs(conflictCount: number, compatibleCount: number) {
  const client = new Anthropic();
  const briefs = [
    ...CONFLICTS.slice(0, conflictCount).map((brief) => ({ kind: "conflict" as const, brief })),
    ...COMPATIBLE_THEMES.slice(0, compatibleCount).map((brief) => ({
      kind: "compatible" as const,
      brief,
    })),
  ];
  const pairs: SeedPair[] = [];
  const used: Record<string, number> = {};
  const nextName = (gender: string) => {
    const list = NAMES[gender];
    const n = used[gender] ?? 0;
    used[gender] = n + 1;
    return n < list.length ? list[n] : `${list[n % list.length]} ${Math.floor(n / list.length) + 1}`;
  };

  for (let i = 0; i < briefs.length; i += CONCURRENCY) {
    const batch = briefs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ kind, brief }, j) => {
        const people = GENDER_PAIRS[(i + j) % GENDER_PAIRS.length].map((gender, k) => ({
          gender,
          name: nextName(gender),
          job: JOBS[(2 * (i + j) + k) % JOBS.length],
          age: agesFor(i + j)[k],
        })) as [Assigned, Assigned];
        const response = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "medium", format: betaZodOutputFormat(PairSchema) },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: pairPrompt(kind, brief, people) }],
        });
        if (response.stop_reason === "refusal" || !response.parsed_output) {
          console.warn(`  skipped "${brief}" (stop_reason: ${response.stop_reason})`);
          return null;
        }
        const pair = response.parsed_output;
        // The assigned identity wins over whatever the model wrote.
        pair.a.display_name = people[0].name;
        pair.b.display_name = people[1].name;
        pair.a.age = people[0].age;
        pair.b.age = people[1].age;
        pair.a.gender = people[0].gender as SeedPersona["gender"];
        pair.b.gender = people[1].gender as SeedPersona["gender"];
        console.log(`  ${kind}: ${pair.a.display_name} + ${pair.b.display_name}`);
        return { ...pair, kind };
      }),
    );
    pairs.push(...results.filter((p): p is SeedPair => p !== null));
  }
  return pairs;
}

function birthdateFor(age: number, n: number) {
  // A birthday that already passed this year, varied per user, so the age is exact.
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 10 - ((n * 37) % 300));
  return d.toISOString().slice(0, 10);
}

async function insertPersona(admin: SupabaseClient, p: SeedPersona, n: number, city: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `seed+${n}@twindate.test`,
    email_confirm: true,
    user_metadata: { seed: true },
  });
  if (error || !data.user) throw new Error(`createUser seed+${n}: ${error?.message}`);
  const userId = data.user.id;

  // The sign-up trigger already created an empty profile and a free subscription.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: p.display_name,
      birthdate: birthdateFor(p.age, n),
      gender: p.gender,
      seeking: p.seeking,
      age_min: p.age_min,
      age_max: p.age_max,
      city,
      goal: p.goal,
      onboarding_complete: true,
      is_seed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (profileError) throw new Error(`profile seed+${n}: ${profileError.message}`);

  const answers = [
    ...TOPICS.map((t) => ({
      user_id: userId,
      topic: t.key,
      answer: (p.answers as Record<string, string>)[t.key],
      tier: t.tier,
    })),
    ...p.notes.map((note) => ({
      user_id: userId,
      topic: `note:${note.topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 34)}`,
      answer: note.answer,
      tier: note.tier,
    })),
  ];
  const { error: answersError } = await admin
    .from("profile_answers")
    .upsert(answers, { onConflict: "user_id,topic" });
  if (answersError) throw new Error(`answers seed+${n}: ${answersError.message}`);

  const { style, ...card } = p.persona;
  const { error: personaError } = await admin
    .from("persona_cards")
    .insert({ user_id: userId, version: 1, card_json: card, style_json: style });
  if (personaError) throw new Error(`persona seed+${n}: ${personaError.message}`);

  return userId;
}

async function deleteSeedUsers(admin: SupabaseClient) {
  const { data, error } = await admin.from("profiles").select("user_id").eq("is_seed", true);
  if (error) throw new Error(error.message);
  for (const { user_id } of data ?? []) {
    // Deleting the auth user cascades to every table.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteError) throw new Error(`deleteUser ${user_id}: ${deleteError.message}`);
  }
  console.log(`Deleted ${data?.length ?? 0} seed users.`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      from: { type: "string" },
      reset: { type: "boolean", default: false },
      conflict: { type: "string", default: "10" },
      compatible: { type: "string", default: "10" },
      cities: { type: "string", default: "San Francisco" },
    },
  });
  const cities = values.cities.split(",").map((c) => c.trim()).filter(Boolean);

  let pairs: (SeedPair & { city: string })[];
  if (values.from) {
    pairs = JSON.parse(readFileSync(values.from, "utf8"));
    console.log(`Loaded ${pairs.length} pairs from ${values.from}.`);
  } else {
    console.log("Generating pairs with Claude...");
    const generated = await generatePairs(Number(values.conflict), Number(values.compatible));
    pairs = generated.map((pair, i) => alignPair(pair, cities[i % cities.length]));
    mkdirSync("scripts/output", { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(pairs, null, 2));
    console.log(`Saved ${pairs.length} pairs to ${OUTPUT_FILE}.`);
  }
  if (values["dry-run"]) return;

  const admin = createAdminClient();
  if (values.reset) {
    await deleteSeedUsers(admin);
  } else {
    const { count } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_seed", true);
    if (count) {
      throw new Error(`${count} seed users already exist. Re-run with --reset to replace them.`);
    }
  }

  let n = 0;
  for (const pair of pairs) {
    const userA = await insertPersona(admin, pair.a, ++n, pair.city);
    const userB = await insertPersona(admin, pair.b, ++n, pair.city);
    const { error } = await admin
      .from("seed_pairs")
      .insert({ user_a: userA, user_b: userB, kind: pair.kind, planted: pair.planted });
    if (error) throw new Error(`seed_pairs: ${error.message}`);
    console.log(`  inserted ${pair.kind} pair: ${pair.a.display_name} + ${pair.b.display_name}`);
  }
  console.log(`Done: ${n} seed users in ${pairs.length} pairs.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
