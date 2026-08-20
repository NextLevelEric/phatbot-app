import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-zinc-800 p-6">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">🤖 PHATBOT Navigation Sensor</p>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">That screen is off the map.</h1>
        <p className="mt-3 leading-6 text-zinc-300">No training data was changed. Head back to the dashboard and continue from a known signal.</p>
        <Link href="/" className="mt-6 block rounded-lg bg-white px-5 py-3 text-center font-bold text-black">Back to Dashboard</Link>
      </div>
    </main>
  );
}
