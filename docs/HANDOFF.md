# Handoff: Sun Oct 18, 2026

Written for the teammate continuing tonight (and their Claude). Deadline: **Thu Oct 22**.
Gate from the PRD: **one full end-to-end run (two users → twin conversation → report) by
Tue Oct 20 night.**

## Where things stand

| Area | Status | Where |
|---|---|---|
| Accounts, repo, Vercel deploy | Done | `main` → https://twin-date.vercel.app |
| Supabase schema (12 tables + RLS) | Done, applied | `supabase/migrations/0001-0003` (all three have been run) |
| Sign-in (email magic link + Google) | Done, on `main` | `src/app/login`, `src/app/auth` |
| Profile form (tiered topics) | Done, on branch | `src/app/onboarding/profile` |
| Interviewer agent (ReAct, multi-message replies) | Done, on branch | `src/lib/agents/interviewer.ts`, `src/app/onboarding/interview` |
| Persona Builder agent (summary + texting style) | Done, on branch | `src/lib/agents/persona-builder.ts` |
| Twin agent + "Talk to your twin" page | Done, on branch | `src/lib/agents/twin.ts`, `src/app/twin` |
| Teammate testing of the onboarding flow | **In progress** | Vercel preview of `feature/profile-onboarding` |
| Seed personas, Scout, twin-to-twin Orchestrator, Judge, shortlist, Stripe | Not started | See next steps |

**Branch to continue from:** `feature/profile-onboarding`. It is pushed but **not merged into
`main` yet**: the live site still shows only sign-in.

## Before you start (one-time setup)

1. `git clone https://github.com/MichaelHcr/Twin_Date.git && cd Twin_Date && git switch feature/profile-onboarding && npm install`
2. Copy `.env.example` to `.env.local` and fill it in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: ask in the team chat
     (Supabase → Project Settings → API Keys).
   - `ANTHROPIC_API_KEY`: your own key from the shared Anthropic Console org. Never commit
     or paste it in chat.
3. `npm run dev`, sign in at http://localhost:3000, and go through profile → interview → twin
   once so you know the flow.

## Next steps, in order

### 0. Merge the onboarding branch (~15 min)
Collect teammates' preview feedback (1-5 "sounds like me" ratings, anything broken). Fix any
blockers, then open a PR from `feature/profile-onboarding` and merge it. Start new work on a
fresh branch from `main`.

### 1. Server-side Supabase access (~20 min), needed by everything below
Twin conversations, ledgers, reports and seed users are written by the server, not by a
signed-in user, and the RLS policies deliberately don't allow browser writes there.
- In Supabase → Project Settings → API Keys, copy the **secret** key. Add it as
  `SUPABASE_SECRET_KEY` to `.env.local` and to Vercel (Production + Preview, Sensitive), then
  redeploy. Add the name (no value) to `.env.example`.
- Add `src/lib/supabase/admin.ts`: a `createClient` from `@supabase/supabase-js` with that
  key and `auth: { persistSession: false }`. Import it **only** from server code
  (route handlers, scripts), never from a `"use client"` file.

### 2. Seed personas (~1.5 h)
The matching pool needs 20-30 synthetic users from day one (PRD: Users and core flow).
- Script `scripts/seed.ts` (run with `npx tsx`), using the admin client: create auth users
  with `auth.admin.createUser({ email: "seed+N@twindate.test", email_confirm: true })`, then
  fill `profiles` (with `onboarding_complete: true`), `profile_answers` for every topic, and
  a `persona_cards` row.
- Use Claude to generate varied personas as JSON (structured output), including style
  profiles with sample lines.
- Include deliberate test pairs for the PRD's evaluation: 10 pairs with a planted dealbreaker
  conflict (for example, wants kids vs. never wants kids) and 10 compatible pairs.
- Add an `is_seed boolean default false` column to `profiles` (new migration) so seed users
  can be filtered out or removed later.

### 3. Twin-to-twin Orchestrator v1 (~3 h): the core of the product
PRD: Twin-to-twin conversation and Agent architecture. Start simple: an API route or script
that takes two user IDs and runs the whole conversation in one go. Background jobs (Inngest)
and `ask_my_human` pausing can come later.
- Plain code, not an LLM: alternates turns, enforces the **20-turn cap**, and stops early on
  a red flag.
- Each turn calls the Twin agent. Reuse `buildTwinSystemPrompt`/`loadTwinPrompt` from
  `src/lib/agents/twin.ts`, and append conversation instructions: the required-topics agenda
  (relationship goal, kids, money, lifestyle/location, 1-2 shared interests), be a discerning
  first date, and push back when values conflict.
- Twin tools via the tool runner (see `interviewer.ts` for the pattern): `update_ledger`
  (pros, cons, assumptions, open questions), `flag_red_flag` (a conflict with a locked
  dealbreaker; the orchestrator ends the conversation), `end_conversation`.
- Write to `conversations` (status, turn_count, end_reason), `messages` (one row per twin
  message; `speaker` = `a`/`b`) and `ledgers` (one row per side). Each twin sees only its own
  ledger.
- Never put names, contact details or photos in a twin's prompt (PRD: Key design rules).
- Mind `maxDuration`: 20 turns × a few seconds may exceed a single request. Running it from a
  script first is fine.

### 4. Judge agent + report page (~2 h)
After a conversation ends, the Judge reads the transcript, both ledgers and both persona
cards, and writes `reports` (score 0-100, summary, evidence quotes, red flags, questions to
ask in person). It uses structured output; see `persona-builder.ts` for the pattern. Then a
page `/matches/[id]` shows the anonymized report and transcript, plus a `/matches` shortlist
ranked by score.

### Later (Mon-Wed, see the PRD build plan)
- Scout: hard filter in SQL (mutual gender preference, age range, goal, city) + ranking;
  needs geocoding for `lat`/`lng`, or match on city for now.
- Decisions: Yes / Pass / connection request, and the identity reveal on a mutual yes.
- Stripe Checkout (test mode) + webhook → `subscriptions.tier`; tier quotas.
- `ask_my_human` notifications and the jump-in feature.
- Twin fidelity rating (1-5 + correction) on `/twin`, which is a PRD P0.
- Privacy screens, delete-my-data, evaluation runs, demo script.

## Known issues and decisions
- **Email sign-in limit**: Supabase's built-in email sends only a few emails per hour, project
  wide. Use Google sign-in for testers (add them under Google Cloud → Audience → Test users),
  or set up Resend as custom SMTP.
- **Persona cards are user-writable** (migration 0003) because the Persona Builder runs as
  the user. Once the admin client exists, consider moving that write to the server and
  dropping the policy.
- `profiles.lat`/`lng` are never filled yet (only `city`).
- The "Talk to your twin" chat isn't saved, by design.
- Interviewer length is a prompt guideline (10-15 replies), not a hard cap.
- Vercel Hobby can't add team members: share previews with the **Share** button.
