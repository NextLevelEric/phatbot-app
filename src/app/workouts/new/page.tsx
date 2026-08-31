"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { trackProductEvent } from "@/lib/productAnalytics";

export default function NewWorkoutPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function createWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaving(true);

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/auth";
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage("Give your workout a name.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("workouts")
      .insert({
        athlete_user_id: user.id,
        name: trimmedName,
        description: description.trim() || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }
    
await trackProductEvent("first_workout_created", {
  dedupeKey: "lifetime",
  entityType: "workout",
  entityId: data.id,
});
    
    window.location.href = `/workouts/${data.id}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
        <h1 className="mt-2 text-3xl font-bold">Create Workout</h1>
        <p className="mt-2 text-zinc-300">Start with the training day. We’ll add exercises next.</p>
      </header>

      <form onSubmit={createWorkout} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 p-6">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Workout name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Push A" maxLength={80} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-400" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Description <span className="font-normal text-zinc-500">optional</span></span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Chest, shoulders, triceps" rows={3} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-zinc-400" />
        </label>

        {message && <p className="text-sm text-red-300">{message}</p>}

        <button disabled={saving} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-60">{saving ? "Creating..." : "Create Workout"}</button>
        <Link href="/workouts" className="text-center text-sm text-zinc-400 hover:text-white">Cancel</Link>
      </form>
    </main>
  );
}
