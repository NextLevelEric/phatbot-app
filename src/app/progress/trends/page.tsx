import Link from "next/link";

export default function TrendsPage(){
  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">PHATBOT Trends</p><h1 className="mt-2 text-3xl font-bold">How do you want to look at progress?</h1><p className="mt-2 text-zinc-400">Choose the view that answers your question. You can switch between them anytime.</p></header>
    <section className="grid gap-4 sm:grid-cols-2">
      <Link href="/progress/workouts" className="rounded-2xl border border-zinc-700 p-6 transition hover:border-[#ff0032]"><p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-500">By Workout</p><h2 className="mt-2 text-2xl font-black">Workout Trends <span className="phat-accent">→</span></h2><p className="mt-3 text-sm leading-6 text-zinc-400">See how complete Push, Pull, Legs, and other workout sessions are performing over time.</p></Link>
      <Link href="/progress/exercises" className="rounded-2xl border border-zinc-700 p-6 transition hover:border-[#ff0032]"><p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-500">By Exercise</p><h2 className="mt-2 text-2xl font-black">Exercise Trends <span className="phat-accent">→</span></h2><p className="mt-3 text-sm leading-6 text-zinc-400">Drill into individual lifts for PRs, progression, plateaus, and performance history.</p></Link>
    </section>
    <Link href="/progress" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Progress Center</Link>
  </main>;
}
