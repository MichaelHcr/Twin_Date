import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { NavLink } from "@/components/nav-link";
import { loadDecisionStates, NO_DECISION, wantsToMeet, type DecisionState } from "@/lib/decisions";
import { single } from "@/lib/matches";
import { signPhotoUrls } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

// The bar across the top of every page. The static shell doubles as the
// loading state; SiteHeader fills in the nav and the account menu.
export function HeaderShell({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-black/90">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-2 px-4 font-sans">
        <Link href="/" className="mr-2 text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          Twin Date
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
          className="ml-auto rounded-full bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Sign in
        </Link>
      </HeaderShell>
    );
  }

  const [{ data: profile }, { data: conversations }, states] = await Promise.all([
    supabase.from("profiles").select("display_name, photos, onboarding_complete").eq("user_id", user.id).single(),
    // Row-level security only returns conversations this user is part of.
    supabase.from("conversations").select("id, reports(score)").eq("status", "ended"),
    // Badges are extras: if decisions can't load, show none rather than break every page.
    loadDecisionStates(supabase).catch(() => new Map<string, DecisionState>()),
  ]);

  // Badges: matches waiting for a yes or pass, requests waiting for an answer,
  // and people already connected.
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
        <nav className="flex items-center gap-1">
          <NavLink href="/matches" count={yourCall} urgent>
            Matches
          </NavLink>
          <NavLink href="/connections" count={requests || connected} urgent={requests > 0}>
            Connections
          </NavLink>
        </nav>
      )}
      <AccountMenu name={name} email={user.email ?? ""} photoUrl={photoUrl} />
    </HeaderShell>
  );
}
