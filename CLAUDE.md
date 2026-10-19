# Twin Date

AI dating app class project, due **Thu 2026-10-22**, team of 4. Each user gets an AI twin
(built from a profile form + an onboarding interview) that has first chats with other
users' twins; users get a ranked shortlist of transcripts and reports.

- PRD (source of truth for scope): https://claude.ai/code/artifact/8ce785e9-b94b-461c-95a3-4070eb5cda3a
- Current status and next steps: [docs/HANDOFF.md](docs/HANDOFF.md). Read it first.
- Live site: https://twin-date.vercel.app (deploys from `main`)
- Course requirements: React, multiple agents (ReAct), authentication, payments, publicly deployed.

@AGENTS.md

## Stack
- Next.js 16 App Router + TypeScript + Tailwind v4, deployed on Vercel (Hobby plan).
- Supabase: Postgres, Auth (email magic link + Google), row-level security on every table.
- Anthropic TypeScript SDK (`@anthropic-ai/sdk`), Zod for validation and structured outputs.

## Commands
- `npm run dev`: local server at http://localhost:3000 (needs `.env.local`, see `.env.example`)
- `npm run build`: production build; run before pushing (Vercel runs the same build)
- `npm run lint`
- `npm run seed`: create synthetic seed users and planted test pairs (`scripts/seed.ts`; `-- --dry-run` to only generate)
- `npm run converse -- <userA> <userB>` or `-- --pair <id>`: run one twin-to-twin conversation (`scripts/converse.ts`)
- Scripts need `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY` in `.env.local`; they use the admin client (`src/lib/supabase/admin.ts`)

## Conventions and gotchas
- **Cache Components is on** (`next.config.ts`). Any server code that reads cookies, auth or
  the database must sit inside `<Suspense>`; pages are a static shell plus an async loader
  component (see `src/app/twin/page.tsx`). `createClient()` in `src/lib/supabase/server.ts`
  calls `await connection()` because Supabase auth reads the clock.
- Middleware is called **`src/proxy.ts`** in Next 16. It refreshes the Supabase session.
- Auth in pages and server actions: `requireUser()` from `src/lib/auth.ts`. API routes check
  `supabase.auth.getUser()` and return 401 JSON.
- After a mutation, purge the browser's cached pages: `revalidatePath("/", "layout")` in a
  server action, or call `refreshPages()` from `src/app/actions.ts` in client code after a
  fetch. Without it, back-navigation shows stale pages.
- **Database changes**: add a numbered file in `supabase/migrations/` and have a human run
  it in the Supabase dashboard (SQL Editor). There is no CLI migration pipeline.
- **Env vars**: changing one in Vercel only affects new deployments. Redeploy (or push an
  empty commit) after changing one. `ANTHROPIC_API_KEY` is server-only; never `NEXT_PUBLIC_`.
- New Supabase redirect domains: previews are already covered by `https://twin-date-*-twin-date.vercel.app/**`.

## Agents (src/lib/agents/)
- Model: `claude-opus-5-5` everywhere, with `output_config.effort` (`low` for chat,
  `medium` for the Persona Builder), and server-side refusal fallback
  (`betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"`). Opus 5.5 doesn't
  accept `thinking: {type: "disabled"}`, `budget_tokens`, or forced `tool_choice`.
- ReAct agents use the SDK tool runner: `client.beta.messages.toolRunner` with `betaZodTool`
  (see `interviewer.ts`). JSON outputs use `client.beta.messages.parse` with
  `betaZodOutputFormat` (see `persona-builder.ts`, `twin.ts`).
- Rules that must hold are enforced in tool code, not only in prompts (for example,
  `finish_interview` refuses until every locked topic is answered).
- Improvisation tiers (`src/lib/profile-topics.ts`): `locked` = twin never guesses, `soft` =
  hedged guess allowed, `open` = may improvise. Twins read facts from `profile_answers`, not
  from the persona card.
- API routes turn agent errors into readable messages with `describeAgentError()` (`errors.ts`).

## Workflow
- Never commit to `main` directly: branch (`feature/...`) → `npm run build` → push → test the
  Vercel preview → pull request on GitHub → merge. `gh` may not be installed; open PRs at
  `https://github.com/MichaelHcr/Twin_Date/compare/main...<branch>`.
- Vercel previews are protected; share them with Vercel's **Share** button.
- The team is new to web development: explain each step plainly and say what the user
  must do in a dashboard (Supabase, Vercel, Google Cloud, Anthropic Console) themselves.
