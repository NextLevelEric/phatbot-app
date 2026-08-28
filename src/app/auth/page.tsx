"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const AUTH_TIMEOUT_MS = 12000;
const MODE_KEY = "phatbot:preferred-mode";

function friendlyAuthMessage(mode: "signin" | "signup", error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();

  if (mode === "signin") {
    if (message.includes("email not confirmed") || code.includes("email_not_confirmed")) {
      return "Your email is not confirmed yet. Open your PHATBOT confirmation email, confirm the account, then try signing in again.";
    }
    if (message.includes("invalid login credentials") || message.includes("invalid credentials") || code.includes("invalid_credentials")) {
      return "PHATBOT could not verify that email and password. Double-check the email, try your password again, or use Forgot password if needed.";
    }
    if (message.includes("rate limit") || code.includes("rate_limit")) {
      return "Too many sign-in attempts were made in a short period. Wait a few minutes, then try again.";
    }
    return "PHATBOT could not sign you in. Please try again. If this keeps happening, use Forgot password or contact support.";
  }

  if (message.includes("already registered") || message.includes("user already registered") || code.includes("user_already_exists")) {
    return "That email already has a PHATBOT account. Use Sign in instead, or use Forgot password if you do not remember the password.";
  }
  if (message.includes("password") && message.includes("weak")) {
    return "That password does not meet the account requirements. Choose a stronger password and try again.";
  }
  if (message.includes("rate limit") || code.includes("rate_limit")) {
    return "Too many signup attempts were made in a short period. Wait a few minutes, then try again.";
  }
  return "PHATBOT could not create that account right now. Check your information and try again.";
}

export default function AuthPage() {
  return <Suspense fallback={<main className="mx-auto min-h-screen max-w-md px-6 py-12 text-zinc-300">Beep boop... loading PHATBOT.</main>}><AuthContent /></Suspense>;
}

function AuthContent() {
  const search = useSearchParams();
  const invited = search.get("invited") === "1";
  const invitedEmail = search.get("email") ?? "";
  const [mode, setMode] = useState<"signin" | "signup">(invited ? "signin" : "signup");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(invited ? "This athlete account was created by your coach. Open the PHATBOT invitation email to activate it and create your password." : "");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => { if (invitedEmail) setEmail(invitedEmail); }, [invitedEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(""); setAwaitingConfirmation(false);
    try {
      const supabase = createSupabaseBrowserClient();
      const normalizedEmail = email.trim().toLowerCase();
      const authRequest = mode === "signup"
        ? supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: `${window.location.origin}/auth` } })
        : supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      const timeout = new Promise<never>((_, reject) => { window.setTimeout(() => reject(new Error("Authentication request timed out.")), AUTH_TIMEOUT_MS); });
      const result = await Promise.race([authRequest, timeout]);
      if (result.error) {
        console.error("PHATBOT athlete authentication failed", { code: result.error.code, status: result.error.status, message: result.error.message });
        setMessage(friendlyAuthMessage(mode, result.error));
        return;
      }
      if (mode === "signup" && !result.data.session) {
        setAwaitingConfirmation(true);
        setMessage("Account created. Check your email to confirm your PHATBOT account. If it does not arrive within a minute, use Resend Confirmation Email below.");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user?.id) {
        console.error("PHATBOT authentication succeeded but no active session was available", { sessionError });
        setMessage("PHATBOT accepted your sign-in, but could not establish a lasting session. Please try signing in again. If this repeats, contact support.");
        return;
      }

      const userId = sessionData.session.user.id;
      await supabase.rpc("claim_my_athlete_invitations");
      if (mode === "signin") {
        const [{ data: coach }, { data: athlete }] = await Promise.all([supabase.from("coach_profiles").select("user_id").eq("user_id", userId).maybeSingle(),supabase.from("athlete_profiles").select("user_id").eq("user_id", userId).maybeSingle()]);
        if (coach) { let preferred: "athlete" | "coach" | null = null; try { const saved = localStorage.getItem(MODE_KEY); if (saved === "athlete" || saved === "coach") preferred = saved; } catch {} if (coach && athlete && preferred === "athlete") { window.location.href = "/"; return; } window.location.href = "/coach"; return; }
      }
      window.location.href = "/";
    } catch (error) {
      console.error("PHATBOT athlete authentication request failed", error);
      setMessage(error instanceof Error && error.message.includes("timed out") ? "PHATBOT authentication timed out. Check your connection and try again." : "PHATBOT could not contact the authentication service. Check your connection and try again.");
    }
    finally { setLoading(false); }
  }

  async function resendConfirmation() {
    if (!email.trim()) { setMessage("Enter the email address you used to create the account."); return; }
    setResending(true); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: `${window.location.origin}/auth` } });
      if (error) {
        console.error("PHATBOT confirmation resend failed", { code: error.code, status: error.status, message: error.message });
        setMessage("PHATBOT could not resend the confirmation email right now. Please try again.");
        return;
      }
      setMessage("Confirmation email resent. Check your inbox and spam folder.");
    } catch (error) {
      console.error("PHATBOT confirmation resend request failed", error);
      setMessage("PHATBOT could not resend the confirmation email right now. Please try again.");
    } finally { setResending(false); }
  }

  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12"><div className="mb-7 flex justify-center"><img src="/branding/PHAT%20BOT%20(3).png" alt="PHATBOT Fitness Robot" className="h-28 w-full max-w-sm object-contain sm:h-32" /></div><p className="phat-accent text-sm font-semibold uppercase tracking-[0.25em]">PHATBOT Athlete</p><h1 className="mt-2 text-4xl font-bold">{invited ? "Activate your coach-created account" : mode === "signup" ? "Create your account" : "Welcome back"}</h1><p className="mt-3 text-zinc-300">{invited ? "Your coach has already created your PHATBOT workspace." : "Track the work. Beat the numbers. Keep improving."}</p>{invited && <div className="mt-6 rounded-xl border border-[rgba(255,0,50,.42)] bg-[rgba(255,0,50,.06)] p-4"><p className="font-semibold">Do not create another account.</p><p className="mt-2 text-sm text-zinc-300">Open the latest PHATBOT invitation email and click <strong>Activate PHATBOT Account</strong>. That link verifies your email and lets you create your password in one step.</p></div>}{!invited && <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">Email<input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button disabled={loading} className="phat-accent-bg mt-2 rounded-lg px-5 py-3 font-semibold disabled:opacity-60">{loading ? "Working..." : mode === "signup" ? "Create Athlete Account" : "Sign In"}</button></form>}{message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}{!invited && mode === "signup" && awaitingConfirmation && <button onClick={resendConfirmation} disabled={resending} className="mt-4 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold disabled:opacity-60">{resending ? "Resending..." : "Resend Confirmation Email"}</button>}{!invited && mode === "signin" && <Link href="/auth/reset" className="mt-4 text-center text-sm text-zinc-300 underline">Forgot password?</Link>}{!invited && <button className="mt-6 text-sm text-zinc-300 underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); setAwaitingConfirmation(false); }}>{mode === "signup" ? "Already have an account? Sign in" : "Need an athlete account? Create one"}</button>}<div className="mt-8 rounded-xl border border-zinc-800 p-5 text-center"><p className="font-semibold">Are you a coach?</p><p className="mt-1 text-sm text-zinc-400">Create a coach account and manage athlete invitations.</p><Link href="/auth/coach" className="mt-4 inline-block rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:border-[#ff0032]">Coach Sign Up / Sign In</Link></div></main>;
}
