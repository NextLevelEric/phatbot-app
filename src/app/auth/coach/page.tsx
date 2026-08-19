"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const AUTH_TIMEOUT_MS = 12000;

export default function CoachAuthPage() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { const invitedEmail = searchParams.get("email"); if (invitedEmail) setEmail(invitedEmail); }, [searchParams]);

  async function finishCoachSetup(userId: string) {
    const supabase = createSupabaseBrowserClient();
    if (name.trim()) await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    const { error } = await supabase.from("coach_profiles").upsert({ user_id: userId, business_name: businessName.trim() || null }, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const authRequest = mode === "signup"
        ? supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { signup_type: "coach", display_name: name.trim(), business_name: businessName.trim() } } })
        : supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Authentication request timed out. Please try again.")), AUTH_TIMEOUT_MS));
      const result = await Promise.race([authRequest, timeout]);
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === "signup" && !result.data.session) { setMessage("Coach account created. Confirm your email, then return here and sign in. Your pending athlete invitation will be waiting for you."); return; }
      if (!result.data.user) { setMessage("Unable to finish coach setup."); return; }
      await finishCoachSetup(result.data.user.id);
      window.location.href = "/coach/invitations";
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create coach account."); }
    finally { setLoading(false); }
  }

  const invited = Boolean(searchParams.get("email"));
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12"><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Coach</p><h1 className="mt-2 text-4xl font-bold">{mode === "signup" ? "Create your coach account" : "Coach sign in"}</h1><p className="mt-3 text-zinc-300">{invited ? "An athlete invited you to PHATBOT. Sign up or sign in with this email to review their invitation." : "Review athlete training, progress, PRs, and performance from one dashboard."}</p><form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">{mode === "signup" && <><label className="flex flex-col gap-2 text-sm font-medium">Your name<input value={name} onChange={(e) => setName(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /></label><label className="flex flex-col gap-2 text-sm font-medium">Business / coaching name <span className="text-zinc-500">(optional)</span><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /></label></>}<label className="flex flex-col gap-2 text-sm font-medium">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" /></label><button disabled={loading} className="mt-2 rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{loading ? "Working..." : mode === "signup" ? "Create Coach Account" : "Sign In as Coach"}</button></form>{message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}<button className="mt-6 text-sm text-zinc-300 underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>{mode === "signup" ? "Already have PHATBOT? Sign in as a coach" : "New coach? Create a coach account"}</button><Link href="/auth" className="mt-4 text-center text-sm text-zinc-500 underline">Athlete sign in / signup</Link></main>;
}
