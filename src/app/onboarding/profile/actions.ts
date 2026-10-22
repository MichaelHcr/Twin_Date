"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseInterests } from "@/lib/agents/interest-parser";
import { describeInterests, INTEREST_CATEGORIES, OTHER_INTERESTS, readInterests, type Interest } from "@/lib/interests";
import { EVERYONE, GENDERS, GOALS, OTHER, SEEKING, TOPICS } from "@/lib/profile-topics";

// An interest as picked on the form, before the AI parses its specifics into items.
export type InterestPick = Omit<Interest, "items">;

export type ProfileValues = {
  display_name: string;
  birthdate: string;
  gender: string;
  city: string;
  seeking: string[];
  age_min: string;
  age_max: string;
  radius_km: string;
  goal: string;
  // Final answer per topic: a chosen option, the "Other" text, or free text.
  topics: Record<string, string>;
  // Free-response topics the user chose to skip for now.
  skipped: string[];
  // Interest categories ticked, with their specifics; replaces the free-text interests answer.
  interests: InterestPick[];
};

export type SaveProfileState = { error: string; values: ProfileValues } | null;

const ProfileSchema = z
  .object({
    display_name: z.string().trim().min(1, "Please enter a first name.").max(40),
    birthdate: z.iso.date("Please enter your birthdate."),
    gender: z
      .string()
      .trim()
      .min(1, "Please choose your gender, or describe it in your own words.")
      .max(40, "Please keep your gender to 40 characters.")
      // Typing a listed gender in your own words counts as choosing it.
      .transform((g) => GENDERS.find((x) => x === g.toLowerCase()) ?? g),
    seeking: z
      .array(z.enum(SEEKING))
      .min(1, "Choose who you're interested in, or Everyone.")
      .transform((s) => (s.includes(EVERYONE) ? [EVERYONE] : s)),
    age_min: z.coerce.number().int().min(18, "Minimum age must be 18 or more."),
    age_max: z.coerce.number().int().max(99),
    city: z.string().trim().min(1, "Please enter your city.").max(80),
    radius_km: z.coerce.number().int().min(1).max(500),
    goal: z.enum(GOALS.map((g) => g.value) as [string, ...string[]], "Please choose what you're looking for."),
  })
  .refine((p) => p.age_max >= p.age_min, "Maximum age must be at least the minimum age.");

function ageOn(birthdate: string, today = new Date()) {
  const b = new Date(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age;
}

function readValues(formData: FormData): ProfileValues {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    display_name: text("display_name"),
    birthdate: text("birthdate"),
    // "self" means the person described their gender in their own words.
    gender: text("gender") === "self" ? text("gender_self").trim() : text("gender"),
    city: text("city"),
    seeking: formData.getAll("seeking").map(String),
    age_min: text("age_min"),
    age_max: text("age_max"),
    radius_km: text("radius_km"),
    goal: text("goal"),
    topics: Object.fromEntries(
      TOPICS.map((t) => {
        const value = text(`topic_${t.key}`).trim();
        return [t.key, value === OTHER ? text(`topic_${t.key}_other`).trim() : value];
      }),
    ),
    skipped: TOPICS.filter((t) => !t.options && formData.get(`skip_${t.key}`) === "on").map((t) => t.key),
    interests: [
      ...INTEREST_CATEGORIES.filter((c) => formData.getAll("interest").includes(c.key)).map((c) => ({
        category: c.key,
        specifics: text(`interest_${c.key}`).trim().slice(0, 300),
        open: formData.get(`interest_${c.key}_open`) === "on",
      })),
      ...(text("interest_other").trim()
        ? [{ category: OTHER_INTERESTS, specifics: text("interest_other").trim().slice(0, 300), open: false }]
        : []),
    ],
  };
}

// Every multiple-choice topic needs an answer; free-response ones need text or "skip for now".
// Interests are optional and come from the category picker instead.
function missingTopic(values: ProfileValues) {
  return TOPICS.find((t) => t.key !== "interests" && !values.topics[t.key] && !values.skipped.includes(t.key));
}

// Parses each interest's specifics into items, reusing the stored items for
// specifics that haven't changed so an unchanged profile needs no model call.
async function withItems(picks: InterestPick[], stored: unknown): Promise<Interest[]> {
  const before = readInterests(stored);
  const known = (p: InterestPick) => before.find((b) => b.category === p.category && b.specifics === p.specifics);
  const parsed = await parseInterests(picks.filter((p) => !known(p)).map((p) => ({ ...p, items: [] })));
  return picks.map((p) => {
    const k = known(p);
    return k ? { ...p, items: k.items } : parsed.find((x) => x.category === p.category)!;
  });
}

// On a validation error, returns the message plus everything the user typed,
// so the form can show it again instead of wiping it.
export async function saveProfile(
  _prev: SaveProfileState,
  formData: FormData,
): Promise<SaveProfileState> {
  const { supabase, user } = await requireUser();
  const values = readValues(formData);

  const parsed = ProfileSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (ageOn(parsed.data.birthdate) < 18) {
    return { error: "You must be 18 or older to use Twin Date.", values };
  }
  const missing = missingTopic(values);
  if (missing) {
    return {
      error: missing.options
        ? `Please answer "${missing.question}" (pick "Other" to write your own).`
        : `Please answer "${missing.question}", or tick "Skip for now".`,
      values,
    };
  }

  const { data: stored } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  const interests = await withItems(values.interests, stored?.interests);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ ...parsed.data, interests, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (profileError) return { error: profileError.message, values };

  // The interests answer is a readable summary of the picker, for the twin and
  // the other agents; no interests clears it.
  const interestsSummary = describeInterests(interests);
  values.topics.interests = interestsSummary;
  if (!interestsSummary) values.skipped.push("interests");

  // The profile holds only what the user entered here; the interview's notes live
  // in interview_facts. A skipped topic clears any earlier answer.
  const answers = TOPICS.flatMap((topic) => {
    const answer = values.skipped.includes(topic.key) ? "" : values.topics[topic.key];
    return answer ? [{ user_id: user.id, topic: topic.key, answer, tier: topic.tier }] : [];
  });
  if (answers.length > 0) {
    const { error } = await supabase
      .from("profile_answers")
      .upsert(answers, { onConflict: "user_id,topic" });
    if (error) return { error: error.message, values };
  }
  if (values.skipped.length > 0) {
    const { error } = await supabase
      .from("profile_answers")
      .delete()
      .eq("user_id", user.id)
      .in("topic", values.skipped);
    if (error) return { error: error.message, values };
  }

  const { data: status } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("user_id", user.id)
    .single();

  // Drop the browser's cached copies of pages, so home and profile show the new data.
  revalidatePath("/", "layout");
  redirect(status?.onboarding_complete ? "/twin" : "/onboarding/interview");
}

// "My profile is right" on an interview conflict: hide that warning. The form
// answer stays as it is, and a later check keeps it hidden.
export async function dismissConflict(index: number) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profile_checks").select("conflicts").eq("user_id", user.id).maybeSingle();
  const conflicts = (data?.conflicts ?? []) as { dismissed?: boolean }[];
  if (!conflicts[index]) return;
  conflicts[index] = { ...conflicts[index], dismissed: true };
  await supabase.from("profile_checks").update({ conflicts }).eq("user_id", user.id);
  revalidatePath("/", "layout");
}
