"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();

    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email to confirm your account, then sign in.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
      <h1 className="mt-2 text-4xl font-bold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-3 text-zinc-300">Track the work. Beat the numbers. Keep improving.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Password
          <input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button disabled={loading} className="mt-2 rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">
          {loading ? "Working..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
      </form>

      {message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}

      <button className="mt-6 text-sm text-zinc-300 underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>
        {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
      </button>
    </main>
  );
}
