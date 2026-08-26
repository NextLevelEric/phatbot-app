"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function DeleteAccountPage() {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteAccount() {
    if (confirmation !== "DELETE") {
      setMessage("Type DELETE exactly to confirm permanent account deletion.");
      return;
    }

    setDeleting(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/auth";
      return;
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ confirmation }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleting(false);
      setMessage(result.error ?? "We could not delete your account. Please try again or contact support.");
      return;
    }

    await supabase.auth.signOut().catch(() => undefined);
    window.location.href = "/auth?account_deleted=1";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-zinc-500">PHATBOT Account</p>
        <h1 className="mt-2 text-3xl font-bold">Delete Account</h1>
        <p className="mt-3 leading-6 text-zinc-300">Permanently delete your PHATBOT account and the training data associated with it.</p>
      </header>

      <section className="rounded-2xl border border-red-900/60 bg-red-950/20 p-5">
        <h2 className="text-xl font-bold text-red-200">This cannot be undone.</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">Deleting your account removes your profile, workout templates, workout history, logged sets, performance scores, personal records, coaching relationships, and other account-linked PHATBOT data. Your sign-in will stop working immediately.</p>
        <p className="mt-3 text-sm leading-6 text-zinc-400">If you only want to stop using PHATBOT temporarily, sign out instead.</p>
      </section>

      <section className="rounded-2xl border border-zinc-800 p-5">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Type DELETE to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono tracking-wider focus:border-red-500 focus:outline-none"
            placeholder="DELETE"
          />
        </label>
        {message && <p className="mt-3 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300">{message}</p>}
        <button
          type="button"
          disabled={deleting || confirmation !== "DELETE"}
          onClick={deleteAccount}
          className="mt-4 w-full rounded-lg bg-red-700 px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting ? "Deleting Account..." : "Permanently Delete My Account"}
        </button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/account" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Back to Account</Link>
        <Link href="/" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Dashboard</Link>
      </div>
    </main>
  );
}
