"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function AcceptAthleteInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
          <p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">
            PHATBOT Athlete
          </p>
          <h1 className="mt-2 text-4xl font-bold">Checking invitation...</h1>
        </main>
      }
    >
      <AcceptAthleteInviteContent />
    </Suspense>
  );
}

function AcceptAthleteInviteContent() {
  const search = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("Checking invitation...");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const tokenHash = search.get("token_hash");
      const rawType = search.get("type");

      if (tokenHash && rawType) {
        const type =
          rawType === "invite" ||
          rawType === "magiclink" ||
          rawType === "recovery"
            ? rawType
            : null;

        if (!type) {
          setMessage(
            "This PHATBOT invitation link is invalid. Ask your coach to resend it."
          );
          return;
        }

        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          setMessage(
            `This PHATBOT invitation could not be verified: ${error.message}. Ask your coach to resend it.`
          );
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setReady(true);
        setMessage(
          "Invitation verified. Create your PHATBOT password to finish setup."
        );
        return;
      }

      setMessage(
        "Open this page from the latest PHATBOT invitation email. If the link has expired, ask your coach to resend it."
      );
    }

    load();
  }, [search]);

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (password.length < 6) {
      setMessage("Use a password with at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);

    const supabase = createSupabaseBrowserClient();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    try {
      await supabase.rpc("claim_my_athlete_invitations");
    } catch {}

    window.location.href = "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="phat-accent text-sm font-semibold uppercase tracking-[.25em]">
        PHATBOT Athlete
      </p>

      <h1 className="mt-2 text-4xl font-bold">Activate your account</h1>

      <p className="mt-3 text-zinc-400">
        Your coach may already be building your workouts. Finish setup and they
        will be waiting for you.
      </p>

      <p className="mt-6 rounded-xl border border-zinc-800 p-4 text-sm">
        {message}
      </p>

      {ready && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="text-sm font-semibold">
            Create password
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3"
              required
            />
          </label>

          <label className="text-sm font-semibold">
            Confirm password
            <input
              type="password"
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3"
              required
            />
          </label>

          <button
            disabled={saving}
            className="phat-accent-bg rounded-lg px-5 py-3 font-bold disabled:opacity-50"
          >
            {saving ? "Activating..." : "Enter PHATBOT"}
          </button>
        </form>
      )}
    </main>
  );
}
