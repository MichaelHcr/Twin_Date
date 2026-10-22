// Interests on the profile form: a few general categories, the specifics a
// person typed for each (parsed into items by the AI), and whether they're open
// to trying other things in that category. Code, not a model, works out the
// overlap between two people, so it can be shown to the Scout and the Judge.

export const INTEREST_CATEGORIES = [
  { key: "sports", label: "Sports & fitness", noun: "sports", placeholder: "e.g. soccer, Arsenal, yoga" },
  { key: "outdoors", label: "Outdoors", noun: "outdoor activities", placeholder: "e.g. hiking, camping, surfing" },
  { key: "music", label: "Music", noun: "music", placeholder: "e.g. jazz, Taylor Swift, playing guitar" },
  { key: "screen", label: "Movies & TV", noun: "movies and shows", placeholder: "e.g. horror, Studio Ghibli, The Bear" },
  { key: "books", label: "Books", noun: "books", placeholder: "e.g. sci-fi, Sally Rooney, poetry" },
  { key: "food", label: "Food & cooking", noun: "food", placeholder: "e.g. baking, ramen spots, vegan cooking" },
  { key: "travel", label: "Travel", noun: "trips", placeholder: "e.g. Japan, road trips, backpacking" },
  { key: "arts", label: "Art & design", noun: "arts", placeholder: "e.g. museums, photography, pottery" },
  { key: "games", label: "Games", noun: "games", placeholder: "e.g. board games, Zelda, chess" },
  { key: "tech", label: "Tech & science", noun: "tech and science", placeholder: "e.g. AI, astronomy, building apps" },
] as const;

// Anything that doesn't fit a category: free text, no "open to trying" box.
export const OTHER_INTERESTS = "other";

export type Interest = {
  category: string;
  specifics: string;
  // Lowercase items parsed from specifics, e.g. ["soccer", "arsenal"].
  items: string[];
  open: boolean;
};

const categoryOf = (key: string) => INTEREST_CATEGORIES.find((c) => c.key === key);

// Fallback when the AI can't parse: split on commas, semicolons, "and" and new lines.
export function splitItems(specifics: string) {
  return [
    ...new Set(
      specifics
        .split(/[,;\n]|\band\b|&/i)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

// One readable line for the twin and the other agents, e.g. "Sports & fitness:
// soccer, Arsenal (open to trying other sports)". Stored as the "interests" answer.
export function describeInterests(interests: Interest[]) {
  return interests
    .map((i) => {
      if (i.category === OTHER_INTERESTS) return `Also: ${i.specifics}`;
      const c = categoryOf(i.category);
      if (!c) return "";
      const what = i.specifics ? `${c.label}: ${i.specifics}` : `${c.label}, in general`;
      if (!i.specifics) return what;
      return `${what} (${i.open ? `open to trying other ${c.noun}` : `just these, not looking for other ${c.noun}`})`;
    })
    .filter(Boolean)
    .join(". ");
}

export type InterestFit = {
  shared: string[];
  // Items the other person likes that each side is open to trying.
  aCouldTry: string[];
  bCouldTry: string[];
  // Categories both picked with no shared item and neither open to the other's.
  noOverlap: string[];
};

// Per category both people picked: the same item is shared; an open side could
// try what the other likes; otherwise that category is no match. A category
// picked with no specifics counts as open to anything in it. Categories only
// one person picked don't count either way.
export function interestFit(a: Interest[], b: Interest[]): InterestFit {
  const fit: InterestFit = { shared: [], aCouldTry: [], bCouldTry: [], noOverlap: [] };
  for (const c of INTEREST_CATEGORIES) {
    const ia = a.find((i) => i.category === c.key);
    const ib = b.find((i) => i.category === c.key);
    if (!ia || !ib) continue;
    if (!ia.items.length && !ib.items.length) {
      fit.shared.push(`${c.label}, in general`);
      continue;
    }
    const label = (item: string) => `${item} (${c.label})`;
    const shared = ia.items.filter((x) => ib.items.includes(x));
    const aOpen = ia.open || ia.items.length === 0;
    const bOpen = ib.open || ib.items.length === 0;
    const aCouldTry = aOpen ? ib.items.filter((x) => !shared.includes(x)) : [];
    const bCouldTry = bOpen ? ia.items.filter((x) => !shared.includes(x)) : [];
    fit.shared.push(...shared.map(label));
    fit.aCouldTry.push(...aCouldTry.map(label));
    fit.bCouldTry.push(...bCouldTry.map(label));
    if (!shared.length && !aCouldTry.length && !bCouldTry.length) {
      fit.noOverlap.push(c.label);
    }
  }
  // Free-text "anything else" items still count when they match exactly.
  const otherA = a.find((i) => i.category === OTHER_INTERESTS)?.items ?? [];
  const otherB = b.find((i) => i.category === OTHER_INTERESTS)?.items ?? [];
  fit.shared.push(...otherA.filter((x) => otherB.includes(x)));
  return fit;
}

// Reads the stored column defensively: rows from before the migration, or
// hand-edited ones, may be missing fields.
export function readInterests(value: unknown): Interest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object" || typeof v.category !== "string") return [];
    const specifics = typeof v.specifics === "string" ? v.specifics : "";
    const items = Array.isArray(v.items) ? v.items.filter((x: unknown) => typeof x === "string") : splitItems(specifics);
    return [{ category: v.category, specifics, items, open: Boolean(v.open) }];
  });
}
