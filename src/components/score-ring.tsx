// A match score as a percentage ring: the arc fills to the score, with "78%"
// in the middle. Colors come from className (the arc uses currentColor).
export function ScoreRing({
  score,
  size = 48,
  className = "text-black dark:text-zinc-50",
}: {
  score: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = Math.max(3, Math.round(size / 13));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% match`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-zinc-200 dark:stroke-zinc-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute font-semibold tabular-nums" style={{ fontSize: Math.round(size * 0.27) }}>
        {clamped}
        <span style={{ fontSize: Math.round(size * 0.18) }}>%</span>
      </span>
    </span>
  );
}
