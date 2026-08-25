"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrorReporter";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("PHATBOT route error", error);
    reportClientError("route_error_boundary", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-[rgba(255,0,50,.35)] bg-[rgba(255,0,50,.04)] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img src="/branding/PHATbot%20ICON.png" alt="PHATBOT" className="h-10 w-10 shrink-0 object-contain" />
          <p className="phat-accent text-xs font-bold uppercase tracking-[.2em]">PHATBOT Signal Error</p>
        </div>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">Something interrupted the transmission.</h1>
        <p className="mt-3 leading-6 text-zinc-300">Your saved training data is still protected. Try the screen again. If the problem continues, return to the dashboard and reopen the workout or report.</p>
        {error.digest && <p className="mt-4 text-xs text-zinc-600">Error reference: {error.digest}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={reset} className="phat-accent-bg rounded-lg px-5 py-3 font-bold">Retry Signal</button>
          <Link href="/" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-bold hover:border-zinc-500">Back to Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
