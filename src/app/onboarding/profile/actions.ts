"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { GENDERS, GOALS, TOPICS } from "@/lib/profile-topics";

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
  topics: Record<string, string>;
};

export type SaveProfileState = { error: string; values: ProfileValues } | null;

const ProfileSchema = z
  .object({
    display_name: z.string().trim().min(1, "Please enter a first name.").max(40),
    birthdate: z.iso.date("Please enter your birthdate."),
    gender: z.enum(GENDERS, "Please choose your gender."),
    seeking: z.array(z.enum(GENDERS)).min(1, "Choose at least one gender you're interested in."),
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
    gender: text("gender"),
    city: text("city"),
    seeking: formData.getAll("seeking").map(String),
    age_min: text("age_min"),
    age_max: text("age_max"),
    radius_km: text("radius_km"),
    goal: text("goal"),
    topics: Object.fromEntries(TOPICS.map((t) => [t.key, text(`topic_${t.key}`).trim()])),
  };
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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (profileError) return { error: profileError.message, values };

  // Blank topics are skipped; the Interviewer will ask about them.
  const answers = TOPICS.flatMap((topic) => {
    const answer = values.topics[topic.key];
    return answer ? [{ user_id: user.id, topic: topic.key, answer, tier: topic.tier }] : [];
  });
  if (answers.length > 0) {
    const { error } = await supabase
      .from("profile_answers")
      .upsert(answers, { onConflict: "user_id,topic" });
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
