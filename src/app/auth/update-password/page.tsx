"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  establishPasswordRecoverySession,
  parsePasswordRecoveryLink,
  shouldClearPasswordRecoveryUrl,
} from "@/features/auth/passwordRecovery";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [recoveryState, setRecoveryState] = useState<"checking" | "ready" | "invalid">("checking");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const link = parsePasswordRecoveryLink(window.location.href);
    if (shouldClearPasswordRecoveryUrl(link)) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    try {
      const supabase = createSupabaseBrowserClient();
      void establishPasswordRecoverySession(supabase.auth, link).then((result) => {
        setRecoveryState(result.ok ? "ready" : "invalid");
      }).catch(() => {
        setRecoveryState("invalid");
      });
    } catch {
      setRecoveryState("invalid");
    }
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      setRecoveryState("invalid");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      if (error.name === "AuthSessionMissingError") {
        setRecoveryState("invalid");
        return;
      }
      setMessage("We couldn't update your password. Please choose a different password and try again.");
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

      {recoveryState === "checking" && (
        <p className="mt-8 rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">
          Verifying your secure recovery link...
        </p>
      )}

      {recoveryState === "ready" && (
        <form onSubmit={updatePassword} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            New password
            <input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 focus:border-[#ff0032] focus:outline-none" />
          </label>
          <button disabled={loading} className="phat-accent-bg rounded-lg px-5 py-3 font-semibold disabled:opacity-60">
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      )}

      {recoveryState === "invalid" && (
        <div className="mt-8 rounded-lg border border-zinc-800 p-4 text-sm text-zinc-200">
          <p>This password reset link is invalid, expired, or has already been used. Your account is safe.</p>
          <Link href="/auth/reset" className="phat-accent-bg mt-4 inline-block rounded-lg px-5 py-3 font-semibold">
            Request a new reset link
          </Link>
        </div>
      )}

      {message && <p className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200">{message}</p>}
    </main>
  );
}
