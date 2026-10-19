import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadLatestPersona } from "@/lib/agents/persona-builder";
import { TwinView } from "./twin-view";
import { BackLink } from "@/components/back-link";

export default function TwinPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <BackLink href="/">Home</BackLink>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your twin
        </h1>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <TwinLoader />
        </Suspense>
      </div>
    </main>
  );
}

async function TwinLoader() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_complete")
    .eq("user_id", user.id)
    .single();
  if (!profile?.display_name) redirect("/onboarding/profile");
  if (!profile.onboarding_complete) redirect("/onboarding/interview");

  const latest = await loadLatestPersona(supabase, user.id);
  return <TwinView name={profile.display_name} latest={latest} />;
}
