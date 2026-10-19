import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Plans from the PRD (Auth, payments and publishing). Prices are created inline
// at checkout, so nothing has to be set up in the Stripe dashboard per plan.
export const PLANS = {
  free: { name: "Free", priceCents: 0, perWeek: 3, blurb: "See how your twin does" },
  plus: { name: "Plus", priceCents: 999, perWeek: 15, blurb: "For actively dating" },
  pro: { name: "Pro", priceCents: 2499, perWeek: 40, blurb: "Meet the whole pool" },
} as const;

export type Tier = keyof typeof PLANS;
export type PaidTier = Exclude<Tier, "free">;

export function isPaidTier(value: unknown): value is PaidTier {
  return value === "plus" || value === "pro";
}

// Server-only: uses the secret key. Test mode keys start with sk_test_.
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY. Add it to .env.local (see .env.example).");
  }
  return new Stripe(key);
}

export type Subscription = {
  tier: Tier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  period_end: string | null;
};

export async function loadSubscription(supabase: SupabaseClient, userId: string): Promise<Subscription> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, stripe_customer_id, stripe_subscription_id, period_end")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    tier: (data?.tier as Tier) ?? "free",
    stripe_customer_id: data?.stripe_customer_id ?? null,
    stripe_subscription_id: data?.stripe_subscription_id ?? null,
    period_end: data?.period_end ?? null,
  };
}

// Twin conversations the user started in the last 7 days. A rolling window means
// there is no weekly reset job; being picked by someone else's Scout doesn't count.
export async function conversationsThisWeek(supabase: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("user_a", userId)
    .gte("created_at", since);
  if (error) throw new Error(`Couldn't count this week's conversations: ${error.message}`);
  return count ?? 0;
}

const PAID_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing"];

// Reads a subscription's current state from Stripe and writes the user's tier.
// Always fetching fresh state makes it safe to call from any webhook event, in
// any order, and again from the checkout success page.
export async function syncSubscription(stripe: Stripe, admin: SupabaseClient, subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = sub.metadata.user_id;
  if (!userId) throw new Error(`Subscription ${sub.id} has no user_id in its metadata.`);

  const paid = PAID_STATUSES.includes(sub.status) && isPaidTier(sub.metadata.tier);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { error } = paid
    ? await admin.from("subscriptions").upsert({
        user_id: userId,
        tier: sub.metadata.tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      })
    : // Downgrade only if this is the subscription on file, so a late event for an
      // old, cancelled subscription can't undo a newer one.
      await admin
        .from("subscriptions")
        .update({ tier: "free", stripe_subscription_id: null, period_end: null })
        .eq("user_id", userId)
        .eq("stripe_subscription_id", sub.id);
  if (error) throw new Error(`Couldn't save subscription for ${userId}: ${error.message}`);
}
