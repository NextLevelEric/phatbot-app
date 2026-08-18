"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Workout = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default function WorkoutsPage() {
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadWorkouts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, description, created_at")
        .eq("athlete_user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) setMessage(error.message);
      setWorkouts(data ?? []);
      setLoading(false);
    }

    loadWorkouts();
  }, []);

  if (loading) {
    return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 text-zinc-300">Loading workouts...</main>;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
          <h1 className="mt-2 text-3xl font-bold">My Workouts</h1>
          <p className="mt-2 text-zinc-300">Choose a template or build a new training day.</p>
        </div>
        <Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Home</Link>
      </header>

      {message && <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">{message}</p>}

      {workouts.length === 0 ? (
        <section className="rounded-2xl border border-zinc-800 p-8 text-center">
          <h2 className="text-2xl font-semibold">No workouts yet</h2>
          <p className="mx-auto mt-3 max-w-md text-zinc-400">Create your first workout template to start tracking progress and building workout history.</p>
          <Link href="/workouts/new" className="mt-6 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-black">+ Create Workout</Link>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {workouts.map((workout) => (
            <article key={workout.id} className="rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{workout.name}</h2>
                  {workout.description && <p className="mt-1 text-sm text-zinc-400">{workout.description}</p>}
                </div>
                <Link href={`/workouts/${workout.id}`} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">View</Link>
              </div>
            </article>
          ))}
          <Link href="/workouts/new" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">+ Create Workout</Link>
        </section>
      )}
    </main>
  );
}
