import type { Report, View } from "@/lib/agents/judge";

// Prints a Judge report to the terminal (used by scripts/judge.ts and scripts/converse.ts).
export function printReport(report: Report) {
  console.log(`\nScore: ${report.score}/100\n${report.summary}`);
  const printView = (label: string, v: View) => {
    console.log(`\n${label}: ${v.headline}`);
    console.log(`  Pros: ${v.pros.join("; ")}`);
    console.log(`  Cons: ${v.cons.join("; ") || "(none)"}`);
    console.log(`  Red flags: ${v.red_flags.join("; ") || "none triggered"}`);
    console.log(`  Next steps: ${v.next_steps.join("; ")}`);
  };
  printView("For Member A", report.for_member_a);
  printView("For Member B", report.for_member_b);
  if (report.red_flags.length) console.log(`\nRed flags:\n  ${report.red_flags.join("\n  ")}`);
  console.log(`\nQuestions to ask:\n  ${report.questions_to_ask.join("\n  ")}`);
}
