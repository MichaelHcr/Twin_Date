"use client";

import { useActionState } from "react";
import { GENDERS, GOALS, TOPICS, type Tier } from "@/lib/profile-topics";
import { saveProfile, type ProfileValues } from "./actions";

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  // After a failed save, show what the user typed rather than the stored values.
  const v = state?.values ?? initial;

  return (
    // React resets a form after its action runs; a new key re-mounts it with `v` as defaults.
    <form key={JSON.stringify(v)} action={action} className="mt-8 flex flex-col gap-8">
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <Section title="The basics">
        <Field label="First name">
          <input name="display_name" required defaultValue={v.display_name} className={inputClass} />
        </Field>
        <Field label="Birthdate">
          <input name="birthdate" type="date" required defaultValue={v.birthdate} className={inputClass} />
        </Field>
        <Field label="I am a">
          <select name="gender" required defaultValue={v.gender} className={inputClass}>
            <option value="" disabled>Choose…</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <input name="city" required placeholder="e.g. Boston, MA" defaultValue={v.city} className={inputClass} />
        </Field>
      </Section>

      <Section title="Who you're looking for">
        <fieldset className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <legend className="mb-1.5">Interested in</legend>
          <div className="flex gap-4">
            {GENDERS.map((g) => (
              <label key={g} className="flex items-center gap-2 font-normal">
                <input type="checkbox" name="seeking" value={g} defaultChecked={v.seeking.includes(g)} />
                {g}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min age">
            <input name="age_min" type="number" min={18} max={99} required defaultValue={v.age_min} className={inputClass} />
          </Field>
          <Field label="Max age">
            <input name="age_max" type="number" min={18} max={99} required defaultValue={v.age_max} className={inputClass} />
          </Field>
          <Field label="Distance (km)">
            <input name="radius_km" type="number" min={1} max={500} required defaultValue={v.radius_km} className={inputClass} />
          </Field>
        </div>
        <Field label="Looking for">
          <select name="goal" required defaultValue={v.goal} className={inputClass}>
            <option value="" disabled>Choose…</option>
            {GOALS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="What matters to you">
        <p className="-mt-2 text-sm text-zinc-500">
          Optional. Topics marked <TierBadge tier="locked" /> are facts your twin will never guess about.
        </p>
        {TOPICS.map((topic) => {
          const saved = v.topics[topic.key] ?? "";
          return (
            <Field
              key={topic.key}
              label={
                <>
                  {topic.question} <TierBadge tier={topic.tier} />
                </>
              }
            >
              {topic.options ? (
                <select name={`topic_${topic.key}`} defaultValue={saved} className={inputClass}>
                  <option value="">Skip for now</option>
                  {/* The interviewer may have saved a free-text answer that isn't one of the options. */}
                  {saved && !topic.options.includes(saved) && <option value={saved}>{saved}</option>}
                  {topic.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <textarea
                  name={`topic_${topic.key}`}
                  rows={topic.key === "dealbreakers" ? 3 : 2}
                  defaultValue={saved}
                  className={inputClass}
                />
              )}
            </Field>
          );
        })}
      </Section>

      <button
        disabled={pending}
        className="sticky bottom-4 rounded-full bg-black px-6 py-3.5 text-base font-semibold text-white shadow-xl hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  if (tier !== "locked") return null;
  return (
    <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:bg-zinc-800">
      never guessed
    </span>
  );
}
