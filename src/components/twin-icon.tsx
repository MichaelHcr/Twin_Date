// The Twin Date mark: two overlapping smiling faces, you and your AI twin.
// Inherits color and size from its className.
export function TwinIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" fill="currentColor" fillOpacity={0.18} />
      <circle cx="7.4" cy="10.7" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="10.7" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="10.7" r="0.85" fill="currentColor" stroke="none" />
      <circle cx="16.6" cy="10.7" r="0.85" fill="currentColor" stroke="none" />
      <path d="M7 13.6c.5.7 1.2 1 2 1s1.5-.3 2-1M13 13.6c.5.7 1.2 1 2 1s1.5-.3 2-1" strokeLinecap="round" />
    </svg>
  );
}

// The twin as a little avatar: the mark on a soft violet circle, for anything
// the AI twins wrote or found.
// onTint: on a violet background already, so the circle is white instead.
export function TwinBadge({
  className = "h-8 w-8",
  iconClassName = "h-5 w-5",
  onTint = false,
}: {
  className?: string;
  iconClassName?: string;
  onTint?: boolean;
}) {
  const tone = onTint
    ? "bg-white text-violet-700 dark:bg-violet-900 dark:text-violet-200"
    : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${className}`}>
      <TwinIcon className={iconClassName} />
    </span>
  );
}
