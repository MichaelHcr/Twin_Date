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
| Server-side admin client (step 1) | Done, on branch, needs `SUPABASE_SECRET_KEY` | `src/lib/supabase/admin.ts` |
| Seed personas script (step 2) | Done, on branch, not run yet | `scripts/seed.ts`, migration `0004` (**not applied yet**) |
| Twin-to-twin Orchestrator v1 (step 3) | Done, on branch, tested against mocks only | `src/lib/agents/orchestrator.ts`, `scripts/converse.ts` |
| Judge agent + `/matches` shortlist + `/matches/[id]` report (step 4) | Done, on branch | `src/lib/agents/judge.ts`, `scripts/judge.ts`, `src/app/matches` |
| Scout + "Find my next match" + live chat page | Done, on branch; needs `SUPABASE_SECRET_KEY` on Vercel | `src/lib/agents/scout.ts`, `src/app/api/matches/find`, `src/app/api/conversations/[id]/step` |
| Stripe (test mode): `/pricing`, Checkout, webhook, weekly quota | Done, on `main` (PR #12); migration `0009` applied | `src/lib/billing.ts`, `src/app/api/stripe`, `src/app/pricing` |

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

### Steps 1-3: built, waiting to be run for real
Code is on branch `claude/elegant-goldberg-bzfv6a` (stacked on `feature/profile-onboarding`).
To run it locally:
1. Run `supabase/migrations/0004_seed_and_conversations.sql` in the Supabase SQL Editor
   (adds `profiles.is_seed`, the `seed_pairs` table, and the `not_a_fit`/`error` end reasons).
2. Add `SUPABASE_SECRET_KEY` to `.env.local`.
3. `npm run seed -- --dry-run --conflict 1 --compatible 1` and read `scripts/output/seed-personas.json`.
   If the personas look good: `npm run seed -- --cities "<your testers' city>"` (10 conflict +
   10 compatible pairs = 40 users by default; change with `--conflict N --compatible N`).
   `--from scripts/output/seed-personas.json` inserts saved personas without new Claude calls.
4. `npm run converse -- --list-pairs`, then `npm run converse -- --pair 1`. Or pass two
   emails/user IDs, for example two real test accounts. The Judge runs at the end.
5. End-to-end check: `npm run converse -- <your email> seed+2@twindate.test`, then open
   http://localhost:3000/matches signed in as yourself.

Web flow: `/matches` → "Find my next match" → the Scout filters (gender both ways, both age
ranges, goal, city, has a twin, not met before) and Claude ranks the rest → a queued
conversation → `/matches/[id]` drives it one turn per request (`/api/conversations/[id]/step`)
while the page is open, then one more request writes the Judge's report. One unfinished chat
per user at a time. All state is in the database, so a closed page just resumes later.

Design notes: twins see each other as "Member A"/"Member B" and the real first name is left out
of their prompts. `flag_red_flag` is refused unless the topic is one of the flagging user's own
locked answers; `end_conversation` is refused before turn 6. A full 20-turn chat takes a few
minutes, so it runs from a script for now; a web trigger needs a background job or
one-turn-per-request.

### 1. Server-side Supabase access (~20 min), needed by everything below
Twin conversations, ledgers, reports and seed users are written by the server, not by a
signed-in user, and the RLS policies deliberately don't allow browser writes there.
- In Supabase → Project Settings → API Keys, copy the **secret** key. Add it as
  `SUPABASE_SECRET_KEY` to `.env.local` and add the name (no value) to `.env.example`.
- **Tonight, only the project owner can change Vercel settings.** Work and test locally; the
  owner will add `SUPABASE_SECRET_KEY` to Vercel (Production + Preview, Sensitive) and
  redeploy on Mon Oct 19. Until then, features that need it will fail on Vercel previews.
  That's expected, so don't debug it.
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

## Stripe setup (test mode, one time)
Code: `src/lib/billing.ts` (plans and quotas), `src/app/api/stripe/{checkout,portal,webhook}`,
`src/app/pricing`. Prices are created inline at checkout, so no products are needed in Stripe.
Quota = conversations the user started in the last 7 days (Free 3, Plus 15, Pro 40).
Paying users switch between Plus and Pro on `/pricing` (`/api/stripe/change-plan`); Stripe prorates the
difference for the rest of the billing period, charging an upgrade right away and crediting a downgrade.
1. Run `supabase/migrations/0009_stripe.sql` in the Supabase SQL Editor.
2. Stripe dashboard, **Test mode on** → Developers → API keys: copy the secret key (`sk_test_...`)
   into `.env.local` and Vercel as `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint `https://twin-date.vercel.app/api/stripe/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy its signing secret (`whsec_...`) to Vercel as
   `STRIPE_WEBHOOK_SECRET`, then redeploy. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   prints a `whsec_` for `.env.local` (the success page also applies the plan without the webhook).
4. Settings → Billing → Customer portal: save the test-mode settings once so "Manage billing" works.
5. Test card `4242 4242 4242 4242`, any future date, any CVC.

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
