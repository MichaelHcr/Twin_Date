import type { Report } from "@/lib/agents/judge";

// Prints a Judge report to the terminal (used by scripts/judge.ts and scripts/converse.ts).
export function printReport(report: Report) {
  console.log(`\nScore: ${report.score}/100\n${report.summary}`);
  console.log("\nEvidence:");
  for (const e of report.evidence) console.log(`  ${e.speaker.toUpperCase()}: "${e.quote}" (${e.why})`);
  if (report.red_flags.length) console.log(`\nRed flags:\n  ${report.red_flags.join("\n  ")}`);
  console.log(`\nQuestions to ask:\n  ${report.questions_to_ask.join("\n  ")}`);
}
