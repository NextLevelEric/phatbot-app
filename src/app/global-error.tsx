"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrorReporter";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("PHATBOT global error", error);
    reportClientError("global_error_boundary", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-black text-white">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-red-900 bg-zinc-950 p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-red-500">PHATBOT Signal Error</p>
            <h1 className="mt-5 text-2xl font-bold sm:text-3xl">PHATBOT hit a system-level interruption.</h1>
            <p className="mt-3 leading-6 text-zinc-300">Your saved training data should still be protected. Retry the app first. If the problem continues, return to the home screen and reopen your workout or report.</p>
            {error.digest && <p className="mt-4 text-xs text-zinc-600">Error reference: {error.digest}</p>}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button onClick={reset} className="rounded-lg bg-[#ff0032] px-5 py-3 font-bold text-white">Retry PHATBOT</button>
              <a href="/" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-bold">Return Home</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
