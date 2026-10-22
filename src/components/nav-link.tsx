"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A header link that's highlighted on its own pages, with an optional count
// badge for things waiting on the user (red) or a plain total (grey).
export function NavLink({
  href,
  children,
  count = 0,
  urgent = false,
}: {
  href: string;
  children: React.ReactNode;
  count?: number;
  urgent?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium sm:flex-none ${
        active
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
      {count > 0 && (
        <span
          className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${
            urgent ? "bg-red-500 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
