import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import {
  conversationsThisWeek,
  getStripe,
  loadSubscription,
  PLANS,
  syncSubscription,
  type Tier,
} from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutButton, ManageBillingButton } from "./plan-buttons";
import { BackLink } from "@/components/back-link";

export default function PricingPage({ searchParams }: PageProps<"/pricing">) {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col">
        <BackLink href="/">Home</BackLink>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Plans
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Your plan sets how many twin chats your twin can have each week.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <PlansLoader searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function PlansLoader({ searchParams }: Pick<PageProps<"/pricing">, "searchParams">) {
  const { supabase, user } = await requireUser();
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;

  // Back from Stripe Checkout: apply the plan now instead of waiting for the webhook,
  // which can arrive a few seconds later (or not at all in local development).
  let notice: { ok: boolean; text: string } | null = null;
  if (sessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.client_reference_id !== user.id) throw new Error("Checkout session belongs to another user.");
      if (session.status !== "complete" || typeof session.subscription !== "string") {
        throw new Error(`Checkout session ${session.id} isn't complete.`);
      }
      await syncSubscription(stripe, createAdminClient(), session.subscription);
      notice = { ok: true, text: "Payment received. Your new plan is active." };
    } catch (error) {
      console.error("Applying the checkout session failed:", error);
      notice = {
        ok: false,
        text: "We couldn't confirm your payment yet. Refresh this page in a minute.",
      };
    }
  } else if (params.canceled) {
    notice = { ok: false, text: "Checkout was canceled. You haven't been charged." };
  }

  const [subscription, used] = await Promise.all([
    loadSubscription(supabase, user.id),
    conversationsThisWeek(supabase, user.id),
  ]);
  const current = subscription.tier;

  return (
    <>
      {notice && (
        <p
          className={`mt-6 rounded-xl px-4 py-3 text-sm ${
            notice.ok
              ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        You&apos;re on <span className="font-medium text-black dark:text-zinc-50">{PLANS[current].name}</span>:
        {" "}
        {used} of {PLANS[current].perWeek} twin chats used in the last 7 days.
        {subscription.period_end && (
          <> Renews on {new Date(subscription.period_end).toLocaleDateString("en-US", { dateStyle: "medium" })}.</>
        )}
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {(Object.keys(PLANS) as Tier[]).map((tier) => {
          const plan = PLANS[tier];
          const isCurrent = tier === current;
          return (
            <li
              key={tier}
              className={`flex flex-col rounded-2xl border bg-white p-5 dark:bg-zinc-950 ${
                isCurrent ? "border-black dark:border-zinc-50" : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <p className="font-medium text-black dark:text-zinc-50">{plan.name}</p>
              <p className="mt-2 text-3xl font-semibold text-black dark:text-zinc-50">
                ${(plan.priceCents / 100).toFixed(2).replace(/\.00$/, "")}
                <span className="text-sm font-normal text-zinc-500">{tier === "free" ? "" : " / month"}</span>
              </p>
              <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{plan.perWeek} twin chats per week</p>
              <p className="text-sm text-zinc-500">{plan.blurb}</p>
              <div className="mt-5 flex-1" />
              {isCurrent ? (
                <p className="text-sm font-medium text-zinc-500">Your plan</p>
              ) : tier === "free" ? null : subscription.stripe_subscription_id ? null : (
                <CheckoutButton tier={tier} label={`Get ${plan.name}`} />
              )}
            </li>
          );
        })}
      </ul>

      {subscription.stripe_subscription_id && (
        <div className="mt-6">
          <ManageBillingButton />
          <p className="mt-2 text-xs text-zinc-500">Cancel or update your card on Stripe&apos;s billing page.</p>
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-500">
        Test mode: no real charges. Pay with card 4242 4242 4242 4242, any future date and any CVC.
      </p>
    </>
  );
}
