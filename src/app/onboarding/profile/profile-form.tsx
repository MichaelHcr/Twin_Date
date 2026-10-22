"use client";

import { useActionState, useState } from "react";
import {
  EVERYONE,
  GENDER_LABELS,
  GENDERS,
  GOALS,
  OTHER,
  SEEKING,
  SEEKING_LABELS,
  TOPICS,
  type Tier,
  type Topic,
} from "@/lib/profile-topics";
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
        <GenderQuestion saved={v.gender} />
        <Field label="City">
          <input name="city" required placeholder="e.g. Boston, MA" defaultValue={v.city} className={inputClass} />
        </Field>
      </Section>

      <Section title="Who you're looking for">
        <SeekingQuestion saved={v.seeking} />
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
          Pick the closest answer, or choose Other to write your own. Topics marked{" "}
          <TierBadge tier="locked" /> are facts your twin will never guess about.
        </p>
        {TOPICS.map((topic) =>
          topic.options ? (
            <ChoiceQuestion key={topic.key} topic={topic} saved={v.topics[topic.key] ?? ""} />
          ) : (
            <FreeQuestion
              key={topic.key}
              topic={topic}
              saved={v.topics[topic.key] ?? ""}
              skipped={v.skipped.includes(topic.key)}
            />
          ),
        )}
      </Section>

      <button
        disabled={pending}
        className="sticky bottom-4 rounded-full bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 px-6 py-3.5 text-base font-semibold text-white shadow-xl disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const pillClass = (selected: boolean) =>
  `cursor-pointer rounded-full border px-3 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-zinc-400 ${
    selected ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
  }`;

// Woman, man, non-binary, or in your own words. A saved gender that isn't one of
// the three was written by the person, so it shows under "In my own words".
function GenderQuestion({ saved }: { saved: string }) {
  const savedIsOwn = saved !== "" && !(GENDERS as readonly string[]).includes(saved);
  const [choice, setChoice] = useState(savedIsOwn ? "self" : saved);
  return (
    <fieldset className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <legend className="mb-2 font-medium">I am</legend>
      <div className="flex flex-wrap gap-2">
        {[...GENDERS, "self" as const].map((g) => (
          <label key={g} className={pillClass(choice === g)}>
            <input
              type="radio"
              name="gender"
              value={g}
              required
              checked={choice === g}
              onChange={() => setChoice(g)}
              className="sr-only"
            />
            {g === "self" ? "In my own words…" : GENDER_LABELS[g]}
          </label>
        ))}
      </div>
      {choice === "self" && (
        <>
          <input
            name="gender_self"
            required
            maxLength={40}
            autoFocus={!savedIsOwn}
            defaultValue={savedIsOwn ? saved : ""}
            placeholder="e.g. genderfluid, agender"
            aria-label="Your gender, in your own words"
            className={inputClass}
          />
          <p className="text-xs text-zinc-500">
            For matching, you&apos;ll be shown to people interested in non-binary people or open to everyone.
          </p>
        </>
      )}
    </fieldset>
  );
}

// Women, men, non-binary people (any mix), or Everyone. Everyone stands alone:
// picking it clears the others, and picking one of them clears Everyone.
function SeekingQuestion({ saved }: { saved: string[] }) {
  const [picked, setPicked] = useState<string[]>(saved);
  const toggle = (s: string) =>
    setPicked((p) =>
      p.includes(s) ? p.filter((x) => x !== s) : s === EVERYONE ? [EVERYONE] : [...p.filter((x) => x !== EVERYONE), s],
    );
  return (
    <fieldset className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <legend className="mb-2 font-medium">Interested in</legend>
      <div className="flex flex-wrap gap-2">
        {SEEKING.map((s) => (
          <label key={s} className={pillClass(picked.includes(s))}>
            <input
              type="checkbox"
              name="seeking"
              value={s}
              checked={picked.includes(s)}
              onChange={() => toggle(s)}
              className="sr-only"
            />
            {SEEKING_LABELS[s]}
          </label>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        {picked.includes(EVERYONE)
          ? "You'll meet people of every gender, including people who describe theirs in their own words."
          : "Pick any mix, or Everyone. We only match you with the genders you pick."}
      </p>
    </fieldset>
  );
}

// Multiple choice with an "Other" write-in. A saved answer that isn't one of the
// options (typed under Other, or from before the options existed) shows as Other.
function ChoiceQuestion({ topic, saved }: { topic: Topic; saved: string }) {
  const options = topic.options ?? [];
  const savedIsOther = saved !== "" && !options.includes(saved);
  const [choice, setChoice] = useState(savedIsOther ? OTHER : saved);
  const name = `topic_${topic.key}`;
  return (
    <fieldset id={`topic-${topic.key}`} className="flex scroll-mt-24 flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <legend className="mb-2 font-medium">
        {topic.question} <TierBadge tier={topic.tier} />
      </legend>
      <div className="flex flex-wrap gap-2">
        {[...options, OTHER].map((o) => (
          <label key={o} className={pillClass(choice === o)}>
            <input
              type="radio"
              name={name}
              value={o}
              checked={choice === o}
              onChange={() => setChoice(o)}
              className="sr-only"
            />
            {o === OTHER ? "Other…" : o}
          </label>
        ))}
      </div>
      {choice === OTHER && (
        <input
          name={`${name}_other`}
          required
          autoFocus={!savedIsOther}
          defaultValue={savedIsOther ? saved : ""}
          placeholder="Your own answer"
          aria-label={`${topic.label}: your own answer`}
          className={inputClass}
        />
      )}
    </fieldset>
  );
}

// Free response, with a checkbox to skip it for now and come back later.
function FreeQuestion({ topic, saved, skipped }: { topic: Topic; saved: string; skipped: boolean }) {
  const [skip, setSkip] = useState(skipped && saved === "");
  return (
    <div id={`topic-${topic.key}`} className="flex scroll-mt-24 flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <label htmlFor={`topic_${topic.key}`}>
        {topic.question} <TierBadge tier={topic.tier} />
      </label>
      <textarea
        id={`topic_${topic.key}`}
        name={`topic_${topic.key}`}
        rows={3}
        required={!skip}
        disabled={skip}
        defaultValue={saved}
        placeholder={topic.placeholder}
        className={`${inputClass} disabled:opacity-50`}
      />
      <label className="flex items-center gap-2 font-normal text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          name={`skip_${topic.key}`}
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
        />
        Skip for now. You can answer this any time from your profile.
      </label>
    </div>
  );
}

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
