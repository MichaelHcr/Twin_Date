import Link from "next/link";

// The "← Back" button at the top of a page.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
    >
      <span aria-hidden className="text-base leading-none">←</span>
      {children}
    </Link>
  );
}
