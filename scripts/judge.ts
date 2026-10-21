// Runs the Judge on finished conversations and prints the report.
//
//   npm run judge -- <conversationId>   judge one conversation (again, if it already has a report)
//   npm run judge -- --all              judge every ended conversation that has no report yet
//
// Needs SUPABASE_SECRET_KEY and ANTHROPIC_API_KEY in .env.local.

import { parseArgs } from "node:util";
import { judgeConversation } from "@/lib/agents/judge";
import { createAdminClient } from "@/lib/supabase/admin";
import { printReport } from "./print-report";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { all: { type: "boolean", default: false } },
  });
  const admin = createAdminClient();

  let ids = positionals;
  if (values.all) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, reports(conversation_id)")
      .eq("status", "ended")
      .neq("end_reason", "error");
    if (error) throw new Error(error.message);
    ids = (data ?? []).filter((c) => !c.reports || (Array.isArray(c.reports) && !c.reports.length)).map((c) => c.id);
    console.log(`${ids.length} conversations to judge.`);
  }
  if (ids.length === 0) throw new Error("Usage: npm run judge -- <conversationId>  |  --all");

  for (const id of ids) {
    console.log(`\n=== ${id}`);
    printReport(await judgeConversation(admin, id));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
