"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [preferredUnit, setPreferredUnit] = useState<"lb" | "kg">("lb");
  const [timezone, setTimezone] = useState("America/New_York");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadAccount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      setEmail(user.email ?? "");

      const [{ data: profile }, { data: athlete }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        supabase.from("athlete_profiles").select("preferred_unit, timezone").eq("user_id", user.id).single(),
      ]);

      setDisplayName(profile?.display_name ?? "");
      setPreferredUnit(athlete?.preferred_unit === "kg" ? "kg" : "lb");
      setTimezone(athlete?.timezone ?? "America/New_York");
      setLoading(false);
    }

    loadAccount();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/auth";
      return;
    }

    const [profileResult, athleteResult] = await Promise.all([
      supabase.from("profiles").update({ display_name: displayName.trim() || null }).eq("id", user.id),
      supabase.from("athlete_profiles").update({ preferred_unit: preferredUnit, timezone: timezone.trim() || "America/New_York" }).eq("user_id", user.id),
    ]);

    setSaving(false);

    if (profileResult.error || athleteResult.error) {
      setMessage(profileResult.error?.message ?? athleteResult.error?.message ?? "Unable to save profile.");
      return;
    }

    setMessage("Profile saved.");
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return <main className="mx-auto min-h-screen max-w-xl px-6 py-12 text-zinc-300">Loading account...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
          <h1 className="mt-2 text-3xl font-bold">Account</h1>
          <p className="mt-2 text-zinc-300">Manage your basic athlete profile.</p>
        </div>
        <Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Home</Link>
      </header>

      <form onSubmit={saveProfile} className="flex flex-col gap-5 rounded-xl border border-zinc-800 p-5">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input disabled value={email} className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-400" />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Weight unit
          <select value={preferredUnit} onChange={(e) => setPreferredUnit(e.target.value as "lb" | "kg")} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3">
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3" />
        </label>

        <button disabled={saving} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">
          {saving ? "Saving..." : "Save Profile"}
        </button>

        {message && <p className="text-sm text-zinc-300">{message}</p>}
      </form>

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 p-5">
        <h2 className="text-lg font-semibold">Security</h2>
        <Link href="/auth/reset" className="rounded-lg border border-zinc-700 px-4 py-3 text-center font-semibold">Change Password</Link>
        <button onClick={signOut} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold">Sign Out</button>
      </section>
    </main>
  );
}
