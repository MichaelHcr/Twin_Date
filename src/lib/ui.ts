// Shared look for the app's pages, so every screen reads as one product.
// Mostly black, white and grey, like Instagram and Hinge. Color is kept for
// small signals, each with one meaning:
//   brand (pink)  liking: the Yes heart and hearts on messages
//   blue          you: your chat bubbles, and unread chats
//   red           something needs you (badges), and dealbreakers
//   violet        what the AI twins found or wrote

// Page background and column.
export const PAGE = "flex flex-1 justify-center bg-zinc-50 px-4 py-8 font-sans dark:bg-black";
export const COLUMN = "flex w-full max-w-xl flex-col";

// A screen-sized white card, and a quiet grey panel inside one.
export const CARD = "rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";
export const PANEL = "rounded-2xl bg-zinc-50 dark:bg-zinc-900";

export const TITLE = "text-xl font-semibold tracking-tight text-black dark:text-zinc-50";
export const LABEL = "text-sm text-zinc-500";
export const MUTED = "text-xs text-zinc-500";

// Buttons: black for the main action, outlined for the rest.
export const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";
export const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900";
export const BTN_PILL =
  "inline-flex items-center rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

// Small grey tags; dealbreakers in red.
export const CHIP = "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm";
export const CHIP_NEUTRAL = `${CHIP} bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`;
export const CHIP_FLAG = `${CHIP} bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`;

// The twins' notes: a soft violet box.
export const TWIN_NOTE =
  "rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:bg-violet-950 dark:text-violet-200";

// Dots: blue for unread chats, red for something that needs you.
export const DOT_UNREAD = "h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500";
export const DOT_ALERT = "h-2.5 w-2.5 shrink-0 rounded-full bg-red-500";

// Your chat bubbles, and the ring around new matches (Instagram's story ring).
export const BUBBLE_MINE = "bg-blue-500 text-white";
export const STORY_RING = "rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-violet-600 p-[2.5px]";
