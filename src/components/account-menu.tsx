"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";

// The avatar button at the top right, with a menu for the profile and signing out.
export function AccountMenu({ name, email, photoUrl }: { name: string; email: string; photoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "block rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900";

  return (
    <div ref={root} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <Avatar name={name} url={photoUrl} className="h-9 w-9 text-sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium text-black sm:block dark:text-zinc-50">
          {name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={name} url={photoUrl} className="h-11 w-11 text-base" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-black dark:text-zinc-50">{name}</p>
              <p className="truncate text-xs text-zinc-500">{email}</p>
            </div>
          </div>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <Link href="/onboarding/profile" onClick={() => setOpen(false)} className={item}>
            Edit profile and photos
          </Link>
          <Link href="/twin" onClick={() => setOpen(false)} className={item}>
            Your twin
          </Link>
          <Link href="/matches" onClick={() => setOpen(false)} className={item}>
            Matches
          </Link>
          <Link href="/connections" onClick={() => setOpen(false)} className={item}>
            Connections
          </Link>
          <Link href="/pricing" onClick={() => setOpen(false)} className={item}>
            Plans and billing
          </Link>
          <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
          <form action="/auth/signout" method="post">
            <button className={`${item} w-full text-left`}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
