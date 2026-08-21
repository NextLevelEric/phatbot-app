"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const AUTH_TIMEOUT_MS = 12000;

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const authRequest = mode === "signup" ? supabase.auth.signUp({ email, password }) : supabase.auth.signInWithPassword({ email, password });
      const timeout = new Promise<never>((_, reject) => { window.setTimeout(() => reject(new Error("Authentication request timed out. Check the Supabase URL/key configuration and try again.")), AUTH_TIMEOUT_MS); });
      const result = await Promise.race([authRequest, timeout]);
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === "signup" && !result.data.session) { setMessage("Account created. Check your email to confirm your account, then sign in."); return; }
      const userId = result.data.user?.id;
      if (mode === "signin" && userId) {
        const { data: coach } = await supabase.from("coach_profiles").select("user_id").eq("user_id", userId).maybeSingle();
        if (coach) { window.location.href = "/coach"; return; }
      }
      window.location.href = "/";
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to contact the authentication service. Please try again."); }
    finally { setLoading(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12"><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p><h1 className="mt-2 text-4xl font-bold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1><p className="mt-3 text-zinc-300">Track the work. Beat the numbers. Keep improving.</p><form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">Email<input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button disabled={loading} className="mt-2 rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{loading ? "Working..." : mode === "signup" ? "Create Athlete Account" : "Sign In"}</button></form>{message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}{mode === "signin" && <Link href="/auth/reset" className="mt-4 text-center text-sm text-zinc-300 underline">Forgot password?</Link>}<button className="mt-6 text-sm text-zinc-300 underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>{mode === "signup" ? "Already have an account? Sign in" : "Need an athlete account? Create one"}</button><div className="mt-8 rounded-xl border border-zinc-800 p-5 text-center"><p className="font-semibold">Are you a coach?</p><p className="mt-1 text-sm text-zinc-400">Create a coach account and manage athlete invitations.</p><Link href="/auth/coach" className="mt-4 inline-block rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold">Coach Sign Up / Sign In</Link></div></main>;
}
