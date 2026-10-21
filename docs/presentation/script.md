# Twin Date — 7-minute script

Four speakers. Times add up to about 6:50. Replace [Speaker N] with your names.

| # | Slide | Speaker | Time |
| --- | --- | --- | --- |
| 1 | Cover | Speaker 1 | 0:10 |
| 2 | Problem | Speaker 1 | 0:40 |
| 3 | Solution | Speaker 1 | 0:30 |
| 4 | Demo | Speaker 2 | 2:30 |
| 5 | Architecture | Speaker 3 | 0:45 |
| 6 | Guardrails | Speaker 3 | 0:35 |
| 7 | Production | Speaker 4 | 0:35 |
| 8 | Plans | Speaker 4 | 0:25 |
| 9 | Lessons And Next | Speaker 4 | 0:35 |
| 10 | Thank You | Speaker 4 | 0:10 |

## 1. Cover

(Speaker 1, 10s): Hi, we're Twin Date. Your AI twin goes on the first chat for you, and hands you back people worth meeting.

## 2. Problem

(Speaker 1, 40s): On dating apps, the questions that decide a match come up last. Do you want kids, how do you handle money, would you move? You spend weeks on small talk first, or you never ask. Filters like age and distance can't tell you how someone talks or what they'd compromise on. Our user is an adult looking for something serious who's tired of swiping.

## 3. Solution

(Speaker 1, 30s): Twin Date gives everyone an AI twin built from their profile and an interview. Your twin chats with other people's twins and stops at a dealbreaker. You get a private report. If you both say yes, the twins step back and every real message is written by you. AI is the right tool because a first chat is open-ended: it needs follow-up questions and judgment. Now [Speaker 2] will show you.

## 4. Demo

(Speaker 2, 2m30s). Prep: one onboarded account with a connected match and one undecided report; start "Find my next match" at the start of the talk so the twins are mid-chat by now.
  (20s) My profile: some facts are locked, so my twin never guesses them. I did a short interview, and I can talk to my twin to check it sounds like me.
  (40s) Find my next match: the Scout filters by gender, age, goal and city, then Claude ranks the rest. Two twins are chatting right now; they cover money, lifestyle and where to live, and push back when something conflicts.
  (30s) The Judge writes the report to me: a score, pros and cons, questions to ask. My Yes or Pass is private.
  (30s) When we both say yes, names and photos unlock. The chat opens with our twins' conversation folded on top; everything below is written by us.
  (30s) Plans: Free gives 3 twin chats a week. I upgrade to Plus with Stripe's test card 4242, and my quota goes to 15. Over to [Speaker 3].

## 5. Architecture

(Speaker 3, 45s): Seven agents, all on Claude. To build your twin, the Interviewer, a ReAct agent with tools, fills gaps in your profile, and the Persona Builder writes your twin. To screen, the Scout filters and ranks. Then an Orchestrator, plain code rather than an LLM, runs two twin agents turn by turn, each with tools to take private notes, flag a red flag or end the chat. The Judge scores it and the Match card agent writes the headline. When a real chat goes quiet, the Chat topics agent suggests something the twins talked about. Agents prepare; people make every decision.

## 6. Guardrails

(Speaker 3, 35s): The important rules live in code, so a clever prompt can't talk around them. A twin can only flag a red flag on one of its own locked answers; the tool refuses otherwise. The Orchestrator caps chats at 20 turns, and the Judge's score is capped at 20 after a dealbreaker. Twins never see names or photos, so one twin can't pull contact details from the other. When something fails, users see a readable message with Retry, a refused request falls back to another model, and since each turn is saved, a chat picks up where it left off. Now [Speaker 4] on shipping it.

## 7. Production

(Speaker 4, 35s): It's live at twin-date.vercel.app: Next.js on Vercel, Supabase for sign-in, data, photos and realtime chat, Claude for the agents, and Stripe for payments. API keys stay on the server. Every table has row-level security, so you only read your own data. Only a signed Stripe webhook can set your plan, so nobody can upgrade themselves. And privacy is the default: a Pass is never shown, and photos unlock only after a mutual yes.

## 8. Plans

(Speaker 4, 25s): Plans are priced by how many people your twin screens each week: 3 on Free, 15 on Plus for $9.99, 40 on Pro for $24.99, under the roughly $15 to $17 entry plans on Hinge or Tinder. Upgrades go through Stripe Checkout, you can switch between Plus and Pro with prorated billing, and cancel in Stripe's portal.

## 9. Lessons And Next

(Speaker 4, 35s): Three lessons. Prompts aren't rules: [confirm with the team: twins were too agreeable until the rules moved into tool code]. Agents outlast a web request, so we run one turn per request and keep all state in the database. And privacy is a product choice: keeping a Pass private and the real chat human-only shaped the whole design. Next: the twin asks you what it doesn't know, we measure red-flag recall on our planted test pairs and the cost per chat, and add background jobs, delete-my-data and blocking.

## 10. Thank You

(Speaker 4, 10s): Thank you! Try it at twin-date.vercel.app. Happy to take questions.

## Before you present

- Open twin-date-slides.html in Chrome, go full screen (Mac: Ctrl+Cmd+F), and move with the arrow keys or Space.
- Prepare one onboarded account with a connected match and one finished report you haven't decided on.
- Press “Find my next match” right at the start, so two twins are mid-chat by the demo.
- Record a backup video of the demo in case the network fails.
- Test card: 4242 4242 4242 4242, any future date, any CVC.
