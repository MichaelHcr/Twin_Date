-- Stripe subscriptions: remember which Stripe subscription set the user's tier,
-- so the billing portal and webhooks can find it.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

alter table public.subscriptions add column stripe_subscription_id text;

-- Weekly usage is counted from conversations (rolling 7 days, src/lib/billing.ts),
-- so used_this_week is no longer written.
comment on column public.subscriptions.used_this_week is 'Unused: see conversationsThisWeek() in src/lib/billing.ts';
