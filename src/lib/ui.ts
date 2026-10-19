// Shared look for the app's pages, so every screen reads as one product.
// Colors carry meaning:
//   brand (pink)  you, the other person, and anything waiting on you
//   violet        what the AI twins found or wrote
//   green         things you line up on
//   amber         questions worth asking
//   red           dealbreakers

// Page background and column.
export const PAGE = "flex flex-1 justify-center bg-zinc-50 px-4 py-8 font-sans dark:bg-black";
export const COLUMN = "flex w-full max-w-xl flex-col";

// A screen-sized white card, and a quiet grey panel inside one.
export const CARD = "rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";
export const PANEL = "rounded-2xl bg-zinc-50 dark:bg-zinc-900";

export const TITLE = "text-xl font-semibold tracking-tight text-black dark:text-zinc-50";
export const LABEL = "text-sm text-zinc-500";
export const MUTED = "text-xs text-zinc-500";

// Buttons.
export const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900";
export const BTN_PILL =
  "inline-flex items-center rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

// Small tags.
export const CHIP = "rounded-full px-2.5 py-1 text-xs font-medium";
export const CHIP_ALIGNED = `${CHIP} bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300`;
export const CHIP_ASK = `${CHIP} bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300`;
export const CHIP_FLAG = `${CHIP} bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300`;
export const CHIP_YOU = `${CHIP} bg-brand-soft text-brand-ink dark:bg-pink-950 dark:text-pink-200`;
export const CHIP_NEUTRAL = `${CHIP} bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400`;

// The twins' notes: a soft violet box.
export const TWIN_NOTE =
  "rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:bg-violet-950 dark:text-violet-200";

// A pink dot for "waiting on you" or unread.
export const DOT = "h-2.5 w-2.5 shrink-0 rounded-full bg-brand";
