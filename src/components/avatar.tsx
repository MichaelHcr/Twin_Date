// A round profile picture, or the first letter of the name on a soft color
// when there's no photo. The color comes from the name, so each person keeps theirs.
const TONES = [
  "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
];

function toneFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({
  name,
  url,
  className = "h-12 w-12 text-lg",
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  if (url) {
    return (
      // Signed Storage URLs change on every visit, so a plain img is simpler than next/image here.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} className={`shrink-0 rounded-full object-cover ${className}`} />
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${toneFor(name)} ${className}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
