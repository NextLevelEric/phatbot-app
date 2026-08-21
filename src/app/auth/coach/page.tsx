"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const AUTH_TIMEOUT_MS = 12000;
const PUBLIC_APP_URL = "https://phatbot-app.vercel.app";

export default function CoachAuthPage() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invitedEmail = params.get("email");
    if (invitedEmail) { setEmail(invitedEmail); setInvited(true); }
    if (params.get("confirmed") === "1") { setMode("signin"); setMessage("Email confirmed. Sign in to review and accept your athlete invitation."); }
  }, []);

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
      const cleanEmail = email.trim().toLowerCase();
      const authRequest = mode === "signup"
        ? supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: `${PUBLIC_APP_URL}/auth/coach?confirmed=1&email=${encodeURIComponent(cleanEmail)}`, data: { signup_type: "coach", display_name: name.trim(), business_name: businessName.trim() } } })
        : supabase.auth.signInWithPassword({ email: cleanEmail, password });
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Authentication request timed out. Please try again.")), AUTH_TIMEOUT_MS));
      const result = await Promise.race([authRequest, timeout]);
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === "signup" && !result.data.session) { setMessage("Coach account created. Check your email to confirm it. The confirmation link will return you to PHATBOT, where you can sign in and accept your athlete invitation."); return; }
      if (!result.data.user) { setMessage("Unable to finish coach setup."); return; }
      await finishCoachSetup(result.data.user.id);
      window.location.href = invited ? "/coach/invitations" : "/coach";
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create coach account."); }
    finally { setLoading(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12"><div className="mb-7 flex justify-center"><img src="/branding/PHAT%20BOT%20(3).png" alt="PHATBOT Fitness Robot" className="h-28 w-full max-w-sm object-contain sm:h-32" /></div><p className="phat-accent text-sm font-semibold uppercase tracking-[0.25em]">PHATBOT Coach</p><h1 className="mt-2 text-4xl font-bold">{mode === "signup" ? "Create your coach account" : "Coach sign in"}</h1><p className="mt-3 text-zinc-300">{invited ? "An athlete invited you to PHATBOT. Sign up or sign in with this email to review their invitation." : "Review athlete training, progress, PRs, and performance from one dashboard."}</p><form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">{mode === "signup" && <><label className="flex flex-col gap-2 text-sm font-medium">Your name<input value={name} onChange={(e) => setName(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" /></label><label className="flex flex-col gap-2 text-sm font-medium">Business / coaching name <span className="text-zinc-500">(optional)</span><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" /></label></>}<label className="flex flex-col gap-2 text-sm font-medium">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" /></label><button disabled={loading} className="phat-accent-bg mt-2 rounded-lg px-5 py-3 font-semibold disabled:opacity-60">{loading ? "Working..." : mode === "signup" ? "Create Coach Account" : "Sign In as Coach"}</button></form>{message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}<button className="mt-6 text-sm text-zinc-300 underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>{mode === "signup" ? "Already have PHATBOT? Sign in as a coach" : "New coach? Create a coach account"}</button><Link href="/auth" className="mt-4 text-center text-sm text-zinc-500 underline">Athlete sign in / signup</Link></main>;
}
