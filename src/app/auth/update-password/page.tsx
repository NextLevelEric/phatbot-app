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
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
      <h1 className="mt-2 text-4xl font-bold">Choose a new password</h1>

      <form onSubmit={updatePassword} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          New password
          <input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" />
        </label>
        <button disabled={loading} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      {message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}
    </main>
  );
}
