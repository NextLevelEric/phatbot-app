import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
        <h1 className="mt-2 text-4xl font-bold">Did you improve today?</h1>
        <p className="mt-4 text-zinc-300">
          PHATBOT tracks progressive overload, workout scoring, personal records, and your performance over time.
        </p>
      </div>
      <Link href="/auth" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">
        Create Account / Sign In
      </Link>
    </main>
  );
}
