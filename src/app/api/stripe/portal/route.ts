import { NextResponse } from "next/server";
import { getStripe, loadSubscription } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

// POST -> { url } : Stripe's billing portal, where a paying user can cancel or
// update their card. Cancelling reaches us as a webhook that sets the tier to free.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { stripe_customer_id } = await loadSubscription(supabase, user.id);
  if (!stripe_customer_id) {
    return NextResponse.json({ error: "You don't have a paid plan yet." }, { status: 409 });
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: stripe_customer_id,
      return_url: `${new URL(request.url).origin}/pricing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Creating a Stripe billing portal session failed:", error);
    return NextResponse.json(
      { error: "The billing page isn't available right now. Try again in a minute." },
      { status: 502 },
    );
  }
}
