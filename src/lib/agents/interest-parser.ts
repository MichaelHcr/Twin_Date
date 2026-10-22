import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { INTEREST_CATEGORIES, OTHER_INTERESTS, splitItems, type Interest } from "@/lib/interests";

// Turns what a person typed for each interest category ("soccer, big Arsenal fan,
// some pickup ball") into short, comparable items ("soccer", "arsenal",
// "basketball"), so two people's interests can be matched in code. If the model
// fails, the items fall back to a plain split on commas.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

const ParsedSchema = z.object({
  categories: z.array(
    z.object({
      category: z.string().describe("The category key exactly as given"),
      items: z.array(z.string()).describe("Short lowercase items, most specific first"),
    }),
  ),
});

const SYSTEM_PROMPT = `You tidy up the interests people list on a dating profile so they can be compared between people.

For each category, turn the free text into a list of short items:
- One thing per item, lowercase, a few words at most: "soccer", "arsenal", "jazz", "sally rooney", "road trips".
- Use the most common name, so the same interest matches across people: "football (soccer)" and "footy" become "soccer"; "hoops" becomes "basketball"; "LOTR" becomes "the lord of the rings".
- Keep specific names (teams, artists, authors, shows, places) as their own items, and also add the general activity when it's implied: "Lakers" gives "lakers" and "basketball".
- Drop filler like "big fan of", "sometimes", "I love". Don't add anything the person didn't say or clearly imply.`;

export async function parseInterests(picks: Interest[]): Promise<Interest[]> {
  const toParse = picks.filter((p) => p.specifics.trim());
  if (!toParse.length) return picks.map((p) => ({ ...p, items: [] }));

  const labelOf = (key: string) =>
    key === OTHER_INTERESTS ? "Anything else" : INTEREST_CATEGORIES.find((c) => c.key === key)?.label ?? key;
  let parsed: Map<string, string[]> = new Map();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(ParsedSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: toParse
            .map((p) => `<category key="${p.category}" label="${labelOf(p.category)}">${p.specifics}</category>`)
            .join("\n"),
        },
      ],
    });
    parsed = new Map(
      (response.parsed_output?.categories ?? []).map((c) => [
        c.category,
        [...new Set(c.items.map((x) => x.trim().toLowerCase()).filter(Boolean))],
      ]),
    );
  } catch (error) {
    console.error("Interest parsing failed; splitting on commas instead.", error);
  }

  return picks.map((p) => ({
    ...p,
    items: p.specifics.trim() ? (parsed.get(p.category)?.length ? parsed.get(p.category)! : splitItems(p.specifics)) : [],
  }));
}
