# Twin Date — Product Requirements Document

v3 · Oct 21, 2026 · @Yuming

## Overview

Twin Date gives each user an AI twin that has the awkward first chat with other users' twins, then hands back a short, private report so the user decides who to meet. It is a public web app built by a team of 4 for the Oct 22, 2026 demo.

**Problem.** On dating apps, the questions that decide a match (kids, money, moving, relationship type) come out late, after hours of small talk, or never. Once two people do match, chats stall because nobody remembers what to pick up.

**What Twin Date does.**

- Before matching: twins screen for dealbreakers and fit, so people only meet matches worth their time.
- After matching: the app hands the people what their twins learned (the twins' chat, a one-line takeaway, topics the twins started) and then gets out of the way. The real chat is written only by the people.

**Goals for the demo.** A user can build a twin, let it screen matches, decide privately on each report, and chat with the people they match, on a live site with sign-in, AI agents and paid plans.

## Users and core flow

The user is an adult (18+) tired of swiping and small talk who is happy to let an AI do the first round. The demo pool adds about 40 synthetic seed members, labeled "Demo profile".

1. Sign up with Google or an email link and confirm you are 18 or older. Returning users use Sign in.
2. Fill in the profile (basics, preferences, multiple-choice tiered topics) and add up to 6 photos. The birthdate must show 18 or older.
3. Do the onboarding interview with the Interviewer agent. The Profile Checker summarizes what the interview added and lists anything that contradicts the form, for you to review. The Persona Builder turns the profile and interview into the twin.
4. Talk to your twin to check it sounds like you.
5. Optional: pick a plan. Everyone starts on Free (3 twin chats a week); Plus gives 15 and Pro 40.
6. Find a match: the Scout filters and ranks, then the two twins chat while the match page is open.
7. Read the report, written to you. Decide at the bottom: Yes, Pass, or after a dealbreaker Request to connect anyway.
8. Both want to meet: names, ages, cities and photos appear, and the match moves to Connections.
9. Chat in person-to-person messages, with the twins' first chat folded above. After 2 quiet days, the app offers something the twins talked about that you haven't.
10. No mutual yes within 7 days: the match quietly moves to Expired for whoever said yes.

## Functional requirements

All requirements below are in scope for the Oct 22 demo. Items planned for later are listed under "Scope and roadmap".

### Profile and onboarding

- Sign in and Sign up are separate. Sign up asks you to confirm you are 18 or older; the profile form checks the birthdate again.
- Profile form: basics, location, age range, gender preference, relationship goal, and multiple-choice tiered topics:
  - Locked (the twin never guesses): kids, religion, smoking, drinking, drugs, relocation, dealbreakers.
  - Soft (the twin may give a hedged guess): pets, money, weekends, politics.
  - Open (the twin may improvise): interests.
  - Every topic offers "Prefer not to say".
- The form is the user's own word and is never changed by AI. What the interview learns is stored separately as interview facts (soft or open only).
- Onboarding interview with the Interviewer agent. It can't finish until the user has sent at least 6 messages, so the twin has enough of their writing.
- Profile Checker: after the interview, a short summary of what the interview added and a list of real contradictions with the form (for example "Never" for smoking on the form, "I smoke when I drink" in the interview). The user reviews them; nothing changes automatically.
- The Persona Builder turns the profile and interview into the twin's voice and summary.
- "Talk to your twin" to check it sounds like you.
- Photos: up to 6 (JPEG, PNG, WebP, 5 MB each) at the top of the profile page; the first is the main photo.
- Profile hero card: main photo, name, age, city, goal, photo count and twin status.

### Matching and twin chats

- Scout: hard filters in code (gender both ways, both age ranges, goal, city, has a twin, not met before), then Claude ranks the rest.
- Twin-to-twin chat: up to 20 turns, one turn per request while the match page is open; a red flag ends it early. Each turn is saved, so a closed page resumes where it left off.
- The weekly quota per plan limits how many matches you can find.

### Reports and match cards

- Judge: a score of 0-100 (capped at 20 after a dealbreaker) and a view written to each reader: a headline, pros, cons, dealbreakers and things to ask in person.
- Match card agent: a headline of 8-16 words and 2-4 tags (aligned, ask, dealbreaker). Written once per report and cached.

### Decisions

- Decide only on the report page, pinned at the bottom while you read.
- Yes and Pass are private; a connection request is shown to the other side, who can Accept.
- Connected = both sides chose yes or request; decisions then lock.
- A yes not returned within 7 days of the twins' chat moves to Expired ("This one didn't turn into a match").
- Passed matches sit in a private Passed group with Send request and Hide; Hide keeps the data.
- Seed members answer automatically: yes when the score is 60 or more and there was no red flag.

### Connections and chat

- Inbox: a row of new matches not yet messaged, then chats sorted by latest message with a preview, time, unread dot and "Known N days".
- Chat: realtime messages, read receipts (Seen), hearts (double-click), typing indicator, emoji picker, photos (JPEG, PNG, WebP, GIF, 8 MB), day separators and send times.
- The twins' first chat sits folded at the top, then a "You matched" divider.
- Starters: the report's questions to ask, until the chat has 6 messages.
- Quiet nudge: after 2 days with no message, one thread the twins started that the people haven't picked up, with a line ready to send. It only fills the message box. No suitable thread, no nudge.

### Payments

- Stripe Checkout in test mode (test cards only): Free $0 (3 twin chats a week), Plus $9.99 a month (15), Pro $24.99 a month (40). The weekly quota applies when finding a new match.
- Switch plans: paying users move between Plus and Pro on /pricing. Stripe prorates by the time left in the billing period: an upgrade charges the difference now, a downgrade leaves a credit on the next invoice. Switching also undoes a pending cancellation.
- Cancel or update the card in Stripe's billing portal. A cancelled plan stays active until its period ends, then the user is back on Free; /pricing shows the end date.
- Only Stripe sets a user's plan: a signature-checked webhook writes it, and /pricing re-checks the plan with Stripe.

## Agent architecture

Nine agents do the preparation and people make every choice: deciding on the report page and writing every real message.

| Stage | Agent | What it does | How |
| --- | --- | --- | --- |
| Build the twin | Interviewer | Fills gaps and gets the user talking | ReAct loop with tools: get_profile_status, save_interview_fact, finish_interview |
| Build the twin | Interest parser | Turns typed interests into short items that can be matched | Structured output; falls back to splitting on commas |
| Build the twin | Profile Checker | Summarizes what the interview added; lists contradictions with the form | Structured output |
| Build the twin | Persona Builder | Writes the twin's voice and summary | Structured output |
| Screen | Scout | Ranks candidates that pass the hard filters | Filters in code, then structured output |
| Screen | Twin (one per side) | Speaks as the user on the first chat | ReAct loop with tools: update_ledger, flag_red_flag, end_conversation |
| Screen | Judge | Scores the chat and writes each reader's view | Structured output |
| Screen | Match card | Headline and tags for the Matches grid | Structured output, cached |
| Meet | Chat topics | Offers a twins' thread when a real chat goes quiet | Structured output, cached |

Not an agent: the **Orchestrator** is plain code that runs the twin-to-twin chat. Human steps: **deciding** (Yes, Pass, request) and **writing every real message**.

Design rules:

- All agents run on Claude. The Interviewer and the twins run a ReAct loop (reason, call a tool, observe, repeat); the others return structured output checked against a schema.
- Rules that must hold live in tool code and the database, not only in prompts: red flags only on one of the twin's own locked answers, no ending a chat before turn 6, the 20-turn cap, the score capped at 20 after a dealbreaker, and the interview needing at least 6 user messages.
- A plain-code orchestrator, not an LLM, takes the turns, enforces the 20-turn cap and stops on a red flag.
- Isolation: each twin sees only its own facts, its own private notes and the transcript, never names or contact details. Twins talk as "Member A" and "Member B".
- Twins read facts from the profile form and interview facts, never from the persona card, so locked facts always come from the user.
- The Match card and Chat topics agents read only what both people can see (the report, the twins' chat, the real chat), never the twins' private notes, and cache what they write.
- Models, chosen per agent for cost: Claude Opus 5.5 for the Judge and Persona Builder (quality matters most, one call each); Claude Sonnet 5.5 for the twins, Interviewer, Scout and Profile Checker (about half the price); Claude Haiku 5.5 for the Match card, Chat topics and Interest parser (short summaries and extraction, a small fraction of the price). Effort is low for chat and medium for the Judge, Persona Builder and Profile Checker.
- The twin and interview chats use prompt caching, so their long system prompts are billed at a fraction of the price after the first request.
- A request Opus or Sonnet declines is retried on a fallback model. Haiku has no fallback, so its features degrade to a plain version instead (for example, interests split on commas).
- Target: plan quotas keep model cost under about 30% of each plan's price (to be measured).

## Privacy, safety and consent

Each rule is enforced in the database or server code, not only in prompts.

| What | Who can see it | How it's enforced |
| --- | --- | --- |
| Your yes or pass | Only you, never the other side | Row-level security plus decision\_states(), which reports only connected and requests |
| A connection request | You and the other person | Shown on purpose so they can accept |
| Why a yes expired | Nobody | Expired never says whether they passed or didn't answer |
| Name, photos, city | The other person, only after a mutual yes | Private buckets, signed URLs valid for 1 hour, admin reads only after the connected check |
| Twins' private ledgers | Server only, never shown | No browser access; the match card and chat topics agents don't read them |
| Chat messages and chat photos | The two connected people | is\_connected() on chat\_messages; chat\_folder\_ok() on the chat-photos bucket |
| Hidden passed matches | Only you | hidden\_matches, own rows only |
| Your profile form | Only you | The interview and Profile Checker never change it; conflicts are shown for you to review |
| Your messages in the chat | Written only by you | AI only suggests (starters, quiet nudge) and fills the box; it never sends |
| Twins' words in the chat | Both people, labeled | Folded, grey, marked "Your twin" and "Their twin" |

Also: 18+ is confirmed at sign-up and checked again against the birthdate; every twin message is labeled as AI; and API keys stay on the server.

## Data model

Data lives in Supabase Postgres with row-level security on every table, plus two private Storage buckets. users comes from Supabase Auth; every other table references it.

| Table or store | Holds | Who can read it |
| --- | --- | --- |
| profiles | Basics, preferences, city, goal, photo paths, seed flag | The owner; others' name, age, city and photos only through the server after a mutual yes |
| profile\_answers | One form answer per topic with its tier | The owner and server code |
| interview\_messages | The onboarding chat | The owner |
| interview\_facts | Extra facts the interview learned (soft or open only) | The owner and server code |
| profile\_checks | The Profile Checker's summary and form-vs-interview conflicts | The owner |
| persona\_cards | The twin's voice and summary, versioned (facts stay in the two tables above) | The owner and server code |
| conversations | Twin-to-twin chats: status, turns, end reason | Both participants |
| messages | The twins' transcript | Both participants |
| ledgers | Each twin's private notes | Server only |
| reports | Score, per-reader views, questions, the cached match card | Both participants |
| decisions | Yes, pass or request per person | Your own; the other side's only as a request; connected via decision\_states() |
| hidden\_matches | Passed matches you hid | Only you |
| chat\_messages | Real messages and photo paths | The two connected people |
| chat\_reads | When each person last read a chat (unread, Seen) | Your own; the other's read time via chat\_other\_read\_at() |
| chat\_reactions | Hearts on messages | The two connected people |
| chat\_topics | Cached quiet-chat topics | Server only |
| subscriptions | Plan, Stripe customer, period end, weekly use | The owner; written by the Stripe webhook |
| seed\_pairs | Planted test pairs (dealbreaker conflict or compatible) for evaluation | Server only |
| photos bucket | Profile photos, one folder per user | The owner; others through signed URLs after a mutual yes |
| chat-photos bucket | Photos sent in chats, one folder per chat | The two connected people |

The human\_questions and learned\_facts tables exist for the planned "Ask my human" feature and are not used yet.

## Navigation and design system

A header on every page is the only navigation; pages don't repeat it with their own buttons.

| Screen | What it shows |
| --- | --- |
| Sign in / Sign up | Two separate entries, each with Google and an email link; Sign up has the 18+ confirmation |
| Header | Twin Date; Connections (first) and Matches with count badges; your avatar and name, opening a menu (profile and photos, your twin, Matches, Connections, plans and billing, sign out) |
| Home | The slogan as the headline. Before onboarding: the next setup step. After: a Matches card and a Connections card |
| Matches | Grid like Hinge's "Likes you": To review tiles (percentage ring, Member B and age, city and goal, one line, tags, red dot), Matched tiles opening the chat, collapsed Waiting, Passed and Expired |
| Report | The per-reader report, the twins' chat, and the Yes / Pass bar |
| Connections | Inbox like Instagram DMs: new matches row, then chats with preview, time, unread dot, "Known N days" |
| Chat | One chat card: back arrow, photo, name, "Matched N days ago", Twins' report button; the twins' chat folded on top; messages; composer with emoji, photo and send |
| Profile | Hero card, photos, the form with a pinned Save, and the interview review (summary and conflicts) |
| Plans | Free, Plus and Pro with the current plan; upgrade through Stripe Checkout, switch between Plus and Pro, or open the billing portal to cancel |

Shared styles live in src/lib/ui.ts. Colors are mostly black, white and grey, and each color has one meaning:

| Color | Means |
| --- | --- |
| Pink | Liking: the Yes heart and hearts on messages |
| Light purple | Your own messages in the real chat |
| Violet | Something the AI twins found or wrote |
| Blue | Unread chats |
| Red | Something needs you (badges), and dealbreakers |

## Scope and roadmap

The demo ships the requirements above; the items below are deliberately left out or planned for after Oct 22.

**Out of scope, by design**

| Not doing | Why |
| --- | --- |
| An AI twin sending messages in the real chat | The real chat is written only by the people |
| AI changing the profile form | The form is the user's own word; conflicts are shown for review instead |
| A "Ready to meet" button | People can suggest meeting themselves |
| Deciding from the Matches list | You decide after reading the report, in one place |
| Tasks, scores or streaks in the inbox | A conversation isn't a task, and the score matters less once people really talk |
| Native mobile apps, chat-history import, production-grade moderation | Beyond a one-week build |

**Planned next**

- Ask my human: the twin asks you a question it can't answer, and your answer joins its facts
- Jump in: you write your twin's next message during a twin chat
- Twin fidelity rating and corrections on Talk to your twin
- Background jobs, so twin chats run without the match page open
- A switch to pause screening
- Delete my data
- Report and block, and unmatch

**Open questions**

- Should the twin appear as a character in the app?

## Success metrics

The demo has to show that twins are faithful, critical rather than agreeable, and affordable; the checks run on the seeded pool.

| Metric | How it's measured | Target |
| --- | --- | --- |
| Twin fidelity | Each team member rates their own twin "sounds like me" | Average 4/5 or higher |
| Red-flag recall | 10 seeded pairs with a planted dealbreaker conflict | 9/10 or more end early with the right red flag |
| False alarms | 10 seeded pairs that fit by design | 1/10 or fewer flagged |
| Judge consistency | The Judge re-run 3 times on one transcript | Score spread of 10 points or less |
| Cost and latency | Tokens and time logged per conversation | A measured number that sets the plan quotas |

## Future improvements

- Learn from outcomes: whether people who met rated the date well, fed back into ranking.
- Anti-gaming: detecting profiles tuned to impress the twin rather than be accurate.
- Push notifications for new messages, requests and quiet-chat topics.
- Native mobile apps.
