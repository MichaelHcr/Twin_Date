// Runs one twin-to-twin conversation and prints it as it happens (docs/HANDOFF.md, step 3).
//
//   npm run converse -- <userA> <userB>     user IDs or emails (e.g. seed+1@twindate.test)
//   npm run converse -- --pair 3            a planted test pair from seed_pairs
//   npm run converse -- --list-pairs        show the planted test pairs
//
// The conversation, messages and both ledgers are saved to Supabase.
// Needs SUPABASE_SECRET_KEY and ANTHROPIC_API_KEY in .env.local.

import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runConversation } from "@/lib/agents/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";

async function resolveUser(admin: SupabaseClient, idOrEmail: string) {
  if (!idOrEmail.includes("@")) return idOrEmail;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === idOrEmail.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 1000) throw new Error(`No user with email ${idOrEmail}.`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pair: { type: "string" },
      "list-pairs": { type: "boolean", default: false },
    },
  });
  const admin = createAdminClient();

  if (values["list-pairs"]) {
    const { data, error } = await admin
      .from("seed_pairs")
      .select("id, kind, planted")
      .order("id");
    if (error) throw new Error(error.message);
    for (const p of data ?? []) console.log(`${p.id}\t${p.kind}\t${p.planted}`);
    return;
  }

  let userA: string;
  let userB: string;
  if (values.pair) {
    const { data, error } = await admin
      .from("seed_pairs")
      .select("user_a, user_b, kind, planted")
      .eq("id", Number(values.pair))
      .single();
    if (error || !data) throw new Error(`No seed pair ${values.pair}.`);
    console.log(`Seed pair ${values.pair} (${data.kind}): ${data.planted}\n`);
    [userA, userB] = [data.user_a, data.user_b];
  } else if (positionals.length === 2) {
    [userA, userB] = await Promise.all(positionals.map((p) => resolveUser(admin, p)));
  } else {
    throw new Error("Usage: npm run converse -- <userA> <userB>  |  --pair <id>  |  --list-pairs");
  }

  const { data: names } = await admin
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", [userA, userB]);
  const nameOf = (id: string) => names?.find((n) => n.user_id === id)?.display_name ?? id;
  const label = { a: `A (${nameOf(userA)})`, b: `B (${nameOf(userB)})` };

  const result = await runConversation(admin, {
    userA,
    userB,
    onTurn: (t) => {
      console.log(`[turn ${t.turn}] ${label[t.speaker]}`);
      for (const m of t.messages) console.log(`  ${m}`);
    },
  });

  console.log(`\nEnded: ${result.endReason}. Conversation id: ${result.conversationId}`);
  console.log(`\nLedger A:\n${JSON.stringify(result.ledgers.a, null, 2)}`);
  console.log(`\nLedger B:\n${JSON.stringify(result.ledgers.b, null, 2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
