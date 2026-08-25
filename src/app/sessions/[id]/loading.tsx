export default function LoadingLiveWorkout() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[.25em] text-zinc-500">PHATBOT Live Workout</p>
        <div className="mt-3 h-10 w-2/3 animate-pulse rounded-lg bg-zinc-900" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-zinc-900" />
      </header>

      <section className="rounded-2xl border border-zinc-800 p-5">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Transmission in progress</p>
        <h1 className="mt-2 text-xl font-bold">Loading your workout.</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          PHATBOT is reconnecting your session, exercise history, and coaching data. Your saved sets stay attached to the workout.
        </p>
      </section>

      {[1, 2, 3].map((item) => (
        <section key={item} className="rounded-2xl border border-zinc-800 p-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-900" />
            <div className="h-6 w-1/2 animate-pulse rounded bg-zinc-900" />
          </div>
          <div className="mt-4 h-20 animate-pulse rounded-xl bg-zinc-950" />
        </section>
      ))}
    </main>
  );
}
