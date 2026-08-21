"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password updated. Redirecting to PHATBOT...");
    window.setTimeout(() => { window.location.href = "/"; }, 1000);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <img src="/branding/PHAT%20BOT%20(3).png" alt="PHATBOT Fitness Robot" className="mb-7 h-auto w-full max-w-[300px] self-center object-contain" />
      <p className="phat-accent text-sm font-semibold uppercase tracking-[0.25em]">PHATBOT Recovery</p>
      <h1 className="mt-2 text-4xl font-bold">Choose a new password</h1>

      <form onSubmit={updatePassword} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          New password
          <input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" />
        </label>
        <button disabled={loading} className="phat-accent-bg rounded-lg px-5 py-3 font-semibold disabled:opacity-60">
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      {message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}
    </main>
  );
}
