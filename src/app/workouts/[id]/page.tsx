"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Workout = {
  id: string;
  name: string;
  description: string | null;
};

export default function WorkoutDetailPage() {
  const params = useParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadWorkout() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, description")
        .eq("id", params.id)
        .eq("athlete_user_id", user.id)
        .single();

      if (error) setMessage(error.message);
      setWorkout(data);
      setLoading(false);
    }

    loadWorkout();
  }, [params.id]);

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Loading workout...</main>;

  if (!workout) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
        <p>{message || "Workout not found."}</p>
        <Link href="/workouts" className="mt-6 inline-block underline">Back to My Workouts</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <header>
        <Link href="/workouts" className="text-sm text-zinc-400 hover:text-white">← My Workouts</Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">Workout Template</p>
        <h1 className="mt-2 text-3xl font-bold">{workout.name}</h1>
        {workout.description && <p className="mt-2 text-zinc-300">{workout.description}</p>}
      </header>

      <section className="rounded-2xl border border-zinc-800 p-6">
        <h2 className="text-xl font-semibold">Exercises</h2>
        <p className="mt-2 text-zinc-400">No exercises added yet.</p>
        <p className="mt-4 text-sm text-zinc-500">Next: build the exercise picker and arrange the order of exercises in this workout.</p>
      </section>

      <button disabled className="rounded-lg bg-white px-5 py-3 font-semibold text-black opacity-50">Start {workout.name} — add exercises first</button>
    </main>
  );
}
