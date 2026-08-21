"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    setLoading(false);
    setMessage(error ? error.message : "Password reset email sent. Check your inbox.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <img src="/branding/PHAT%20BOT%20(3).png" alt="PHATBOT Fitness Robot" className="mb-7 h-auto w-full max-w-[300px] self-center object-contain" />
      <p className="phat-accent text-sm font-semibold uppercase tracking-[0.25em]">PHATBOT Recovery</p>
      <h1 className="mt-2 text-4xl font-bold">Reset password</h1>
      <p className="mt-3 text-zinc-300">Enter your account email and we’ll send you a secure reset link.</p>

      <form onSubmit={requestReset} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" />
        </label>
        <button disabled={loading} className="phat-accent-bg rounded-lg px-5 py-3 font-semibold disabled:opacity-60">
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>

      {message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}
      <Link href="/auth" className="mt-6 text-center text-sm text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-white">Back to sign in</Link>
    </main>
  );
}
