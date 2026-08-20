"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("PHATBOT route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-zinc-700 p-6">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-400">🤖 PHATBOT Signal Error</p>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Something interrupted the transmission.</h1>
        <p className="mt-3 leading-6 text-zinc-300">Your saved training data is still protected. Try the screen again. If the problem continues, return to the dashboard and reopen the workout or report.</p>
        {error.digest && <p className="mt-4 text-xs text-zinc-600">Error reference: {error.digest}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={reset} className="rounded-lg bg-white px-5 py-3 font-bold text-black">Retry Signal</button>
          <Link href="/" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-bold">Back to Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
