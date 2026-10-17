export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-24 text-center font-sans dark:bg-black">
      <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Twin Date
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Your AI twin goes on the first chat for you, then hands you a shortlist
        of people worth meeting.
      </p>
      <span className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-500 dark:border-zinc-700">
        Coming soon
      </span>
    </main>
  );
}
