"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function LiveWorkoutError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("PHATBOT live workout route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-4 py-10 sm:px-6">
      <section className="rounded-2xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-6">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-[#ff0032]">PHATBOT connection issue</p>
        <h1 className="mt-3 text-2xl font-bold">Your workout could not load cleanly.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Your sets already saved to PHATBOT are not deleted by this screen. Try reconnecting the workout before entering anything again.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button onClick={reset} className="rounded-xl bg-white px-5 py-3 font-bold text-black">
            Retry Workout
          </button>
          <Link href="/" className="rounded-xl border border-zinc-700 px-5 py-3 text-center font-semibold">
            Return Home
          </Link>
        </div>
      </section>
      <p className="text-center text-xs text-zinc-600">If retrying does not work, return Home and resume the active workout from there.</p>
    </main>
  );
}
