// A round profile picture, or the first letter of the name when there's no photo.
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
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-800 dark:bg-green-950 dark:text-green-300 ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
