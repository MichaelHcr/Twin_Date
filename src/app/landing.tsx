import Link from "next/link";

// The home page for signed-out visitors: what Twin Date is and why, following
// slides 2 (the problem) and 3 (our solution) of the demo deck, in its look.

const PROBLEMS = [
  { title: "Screening takes hours", body: "Many chats before you know if it fits." },
  { title: "Profiles miss real fit", body: "Photos and age say little about values or plans." },
  { title: "Too many choices", body: "Endless swiping wears people out." },
];

const SOLUTIONS = [
  { before: "Hours of chats", after: "Twins chat first, and stop at a dealbreaker", human: false },
  { before: "Shallow profiles", after: "An interview, then twins talk values and plans", human: false },
  { before: "Too many choices", after: "A short, ranked list, each with a report", human: true },
];

export function Landing() {
  return (
    <main className="landing flex-1 overflow-hidden font-sans text-(--ink)">
      <Hero />
      <Problem />
      <Solution />
      <section className="px-4 pb-24 pt-8 text-center">
        <h2 className="rise mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Let your twin take the <span className="text-(--love)">first chat.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-(--muted)">
          Start free: your twin screens 3 matches a week.
        </p>
        <AuthButtons className="mt-8" />
      </section>
    </main>
  );
}

function Hero() {
  return (
    <section className="relative px-4 pb-20 pt-16 text-center sm:pt-24">
      <Glow className="-top-32 left-1/2 h-[28rem] w-[36rem] -translate-x-[90%] bg-[#d9cffc]" />
      <Glow className="right-1/2 top-40 h-[24rem] w-[30rem] translate-x-[95%] bg-[#fbcfe0]" />
      <div className="relative">
        <p className="rise text-sm font-semibold uppercase tracking-[0.14em] text-(--twin)">AI-first dating</p>
        <h1
          className="rise mx-auto mt-5 max-w-3xl text-5xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-7xl"
          style={{ "--d": ".1s" } as React.CSSProperties}
        >
          Your AI twin goes on the <span className="text-(--love)">first chat</span> for you.
        </h1>
        <p
          className="rise mx-auto mt-6 max-w-xl text-lg leading-relaxed text-(--muted) sm:text-xl"
          style={{ "--d": ".2s" } as React.CSSProperties}
        >
          It talks values and plans with other people&apos;s twins, stops at a dealbreaker, and hands you a short
          list of people worth meeting.
        </p>
        <AuthButtons className="rise mt-9" style={{ "--d": ".3s" } as React.CSSProperties} />
        <TwinChat />
      </div>
    </section>
  );
}

// Log in and Sign up, side by side in the middle of the page.
function AuthButtons({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${className}`} style={style}>
      <Link
        href="/login?mode=signup"
        className="inline-flex min-w-36 items-center justify-center rounded-full bg-linear-to-r from-pink-500 to-violet-600 px-7 py-3.5 text-base font-semibold text-white shadow-md shadow-pink-500/20 transition hover:brightness-110"
      >
        Sign up
      </Link>
      <Link
        href="/login"
        className="inline-flex min-w-36 items-center justify-center rounded-full border border-(--line) bg-(--card) px-7 py-3.5 text-base font-semibold text-(--ink) transition hover:border-(--muted)"
      >
        Log in
      </Link>
    </div>
  );
}

// The deck's cover: a few lines from two twins, then the match score.
function TwinChat() {
  const delay = (d: number) => ({ "--d": `${d}s` }) as React.CSSProperties;
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 text-left">
      <Bubble side="a" who="Your twin" style={delay(0.5)}>
        Would you move for the right job?
      </Bubble>
      <Bubble side="b" who="Their twin" style={delay(0.8)}>
        Maybe, but LA feels like home.
      </Bubble>
      <Bubble side="a" who="Your twin" style={delay(1.1)}>
        Same. My weekends are all hikes.
      </Bubble>
      <div className="rise mt-2 flex items-center gap-3 self-center" style={delay(1.4)}>
        <div
          className="grid h-14 w-14 place-items-center rounded-full"
          style={{ background: "conic-gradient(var(--love) 0 86%, var(--love-soft) 0)" }}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-(--paper) text-sm font-bold">86</span>
        </div>
        <span className="text-lg font-semibold text-(--love)">Worth meeting</span>
      </div>
    </div>
  );
}

function Bubble({
  side,
  who,
  style,
  children,
}: {
  side: "a" | "b";
  who: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const look =
    side === "a"
      ? "self-start rounded-bl-md bg-(--twin-soft) text-[#2b1f6b]"
      : "self-end rounded-br-md bg-(--card) shadow-[0_8px_24px_rgba(29,27,38,0.06)]";
  return (
    <p className={`rise max-w-[85%] rounded-3xl px-5 py-3.5 text-base leading-snug ${look}`} style={style}>
      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-widest opacity-70">{who}</span>
      {children}
    </p>
  );
}

function Problem() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-(--love)">The problem</p>
      <h2 className="mt-4 max-w-2xl text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
        Dating apps make <span className="text-(--love)">you</span> do the screening.
      </h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {PROBLEMS.map((p, i) => (
          <div key={p.title} className="flex flex-col gap-3 rounded-3xl border border-(--line) bg-(--card) p-7">
            <span className="text-sm font-bold text-(--love)">0{i + 1}</span>
            <p className="text-2xl font-semibold leading-tight">{p.title}</p>
            <p className="text-(--muted)">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Solution() {
  return (
    <section className="relative mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
      <Glow className="-right-40 -top-10 h-[26rem] w-[32rem] bg-[#d9cffc] opacity-40" />
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-(--twin)">How it works</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
          An AI twin does the first round.
        </h2>
        <div className="mt-10 flex flex-col gap-3">
          {SOLUTIONS.map((s) => (
            <div key={s.before} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <div className="rounded-2xl bg-zinc-100 px-5 py-4 text-lg font-semibold text-(--muted) line-through decoration-1 sm:w-64 sm:shrink-0">
                {s.before}
              </div>
              <Arrow />
              <div
                className={`flex-1 rounded-2xl px-5 py-4 text-lg font-semibold ${
                  s.human ? "bg-(--love-soft) text-[#831843]" : "bg-(--twin-soft) text-[#2b1f6b]"
                }`}
              >
                {s.after}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-3xl text-xl leading-relaxed text-(--muted)">
          <b className="font-semibold text-(--ink)">Why AI:</b> fit shows up in conversation, not checkboxes. Your
          twin has that first conversation for you, and you decide who to meet. Every real message is written by you.
        </p>
      </div>
    </section>
  );
}

// Right on wide screens, down when the rows stack on a phone.
function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 self-center rotate-90 text-[#b9b2a6] sm:rotate-0">
      <path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Soft blurred color fields behind the content, as on the deck.
function Glow({ className }: { className: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute rounded-full opacity-55 blur-[90px] ${className}`} />;
}
