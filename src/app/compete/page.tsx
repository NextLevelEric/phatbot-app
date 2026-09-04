import Link from "next/link";

export default function CompetePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Compete</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">The arena is warming up.</h1>
        <p className="mt-4 max-w-xl text-zinc-300">
          Beast, Eager Beaver, Cardio Bunny, and Step King are being prepared for PHATBOT competition.
          Rankings will appear here only when the competition system can calculate them fairly and protect athlete privacy.
        </p>
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-black p-5">
          <p className="font-bold">No placeholder rankings. No fake scores.</p>
          <p className="mt-2 text-sm text-zinc-400">Keep training. Your completed workouts are still building your PHATBOT history.</p>
        </div>
        <Link href="/workouts" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-black text-black">
          Go Train →
        </Link>
      </section>
    </main>
  );
}
