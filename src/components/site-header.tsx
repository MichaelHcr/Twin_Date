import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { ChatNotifier } from "@/components/chat-notifier";
import { NavLink } from "@/components/nav-link";
import { loadChatSummaries } from "@/lib/chat";
import { loadDecisionStates, NO_DECISION, wantsToMeet, type DecisionState } from "@/lib/decisions";
import { single } from "@/lib/matches";
import { signPhotoUrls } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

// The bar across the top of every page. The static shell doubles as the
// loading state; SiteHeader fills in the nav and the account menu.
export function HeaderShell({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/60 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex min-h-16 w-full max-w-3xl flex-wrap items-center gap-x-2 px-4 font-sans">
        {/* On phones the nav drops to its own row under the logo and avatar. */}
        <Link href="/" className="mr-3 flex h-16 items-center text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          Twin <span className="ml-1 text-pink-500">Date</span>
        </Link>
        {children}
      </div>
    </header>
  );
}

type Row = {
  id: string;
  reports: { score: number } | { score: number }[] | null;
};

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <HeaderShell>
        <Link
          href="/login"
          className="ml-auto rounded-full bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 px-4 py-2 text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </HeaderShell>
    );
  }

  const [{ data: profile }, { data: conversations }, states, chats] = await Promise.all([
    supabase.from("profiles").select("display_name, photos, onboarding_complete").eq("user_id", user.id).single(),
    // Row-level security only returns conversations this user is part of.
    supabase.from("conversations").select("id, reports(score)").eq("status", "ended"),
    // Badges are extras: if decisions can't load, show none rather than break every page.
    loadDecisionStates(supabase).catch(() => new Map<string, DecisionState>()),
    loadChatSummaries(supabase),
  ]);
  const unreadChats = [...chats.values()].filter((c) => c.unread > 0).length;

  // Badges: on Matches, everything waiting for your answer (red when someone sent
  // you a request, since those sit at the top of the Matches page); on
  // Connections, chats with unread messages, or else how many are connected.
  let yourCall = 0;
  let requests = 0;
  let connected = 0;
  for (const c of (conversations ?? []) as Row[]) {
    if (!single(c.reports)) continue;
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) connected++;
    else if (state.theyRequested && !wantsToMeet(state.mine)) requests++;
    else if (state.mine === null) yourCall++;
  }

  const [photoUrl = null] = await signPhotoUrls(supabase, ((profile?.photos ?? []) as string[]).slice(0, 1));
  const name = profile?.display_name || "You";

  return (
    <HeaderShell>
      {profile?.onboarding_complete && (
        <nav className="order-last -mx-1 flex w-full items-center justify-between gap-1 pb-2 sm:order-none sm:mx-0 sm:w-auto sm:justify-start sm:pb-0">
          <NavLink href="/connections" count={unreadChats || connected} urgent={unreadChats > 0}>
            Connections
          </NavLink>
          <NavLink href="/matches" count={yourCall + requests} urgent={requests > 0}>
            Matches
          </NavLink>
          <NavLink href="/twin">My twin</NavLink>
        </nav>
      )}
      <AccountMenu name={name} email={user.email ?? ""} photoUrl={photoUrl} />
      <ChatNotifier userId={user.id} />
    </HeaderShell>
  );
}
