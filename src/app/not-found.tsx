import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-zinc-800 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img src="/branding/PHATbot%20ICON.png" alt="PHATBOT" className="h-10 w-10 shrink-0 object-contain" />
          <p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">PHATBOT Navigation Sensor</p>
        </div>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">That screen is off the map.</h1>
        <p className="mt-3 leading-6 text-zinc-300">No training data was changed. Head back to the dashboard and continue from a known signal.</p>
        <Link href="/" className="phat-accent-bg mt-6 block rounded-lg px-5 py-3 text-center font-bold">Back to Dashboard</Link>
      </div>
    </main>
  );
}
