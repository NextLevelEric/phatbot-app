"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ClientRow = {
  athleteId: string;
  name: string;
  latestWorkout: string | null;
  latestWorkoutAt: string | null;
  workoutsThisWeek: number;
};

function mondayStart() {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function CoachDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }

      const { data: coach } = await supabase.from("coach_profiles").select("user_id, business_name").eq("user_id", user.id).maybeSingle();
      if (!coach) { setEnabled(false); setLoading(false); return; }
      setEnabled(true);

      const { data: links, error } = await supabase.from("coach_athletes").select("athlete_user_id").eq("coach_user_id", user.id).eq("active", true);
      if (error) { setMessage(error.message); setLoading(false); return; }

      const weekStart = mondayStart();
      const rows: ClientRow[] = [];
      for (const link of links ?? []) {
        const athleteId = link.athlete_user_id;
        const [profileResult, latestResult, weeklyResult] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", athleteId).maybeSingle(),
          supabase.from("workout_sessions").select("workout_name_snapshot, completed_at").eq("athlete_user_id", athleteId).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("athlete_user_id", athleteId).eq("status", "completed").gte("completed_at", weekStart.toISOString()),
        ]);

        rows.push({
          athleteId,
          name: profileResult.data?.display_name ?? "Athlete",
          latestWorkout: latestResult.data?.workout_name_snapshot ?? null,
          latestWorkoutAt: latestResult.data?.completed_at ?? null,
          workoutsThisWeek: weeklyResult.count ?? 0,
        });
      }

      setClients(rows);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-zinc-300">Loading coach dashboard...</main>;

  if (!enabled) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10"><header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Coach</p><h1 className="mt-2 text-3xl font-bold">Coach Dashboard</h1></header><section className="rounded-xl border border-zinc-800 p-6"><h2 className="text-xl font-semibold">Coach mode is not enabled yet.</h2><p className="mt-2 text-zinc-400">Enable coach mode from your Account page first. Your athlete account and workout history will stay intact.</p><Link href="/account" className="mt-5 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-black">Go to Account</Link></section><Link href="/" className="text-sm font-semibold underline">Back to athlete dashboard</Link></main>;

  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10"><header className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Coach</p><h1 className="mt-2 text-3xl font-bold">Coach Dashboard</h1><p className="mt-2 text-zinc-400">A quick view of the athletes linked to you.</p></div><Link href="/" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Athlete View</Link></header>{message && <p className="rounded-xl border border-zinc-800 p-4 text-sm">{message}</p>}<section className="rounded-xl border border-zinc-800 p-5"><p className="text-sm text-zinc-500">Active Clients</p><p className="mt-2 text-4xl font-black">{clients.length}</p></section><section className="flex flex-col gap-3">{clients.length === 0 ? <div className="rounded-xl border border-zinc-800 p-6"><h2 className="text-lg font-semibold">No clients linked yet</h2><p className="mt-2 text-sm text-zinc-400">The coach dashboard is ready. The next step is adding a secure client invitation/linking flow.</p></div> : clients.map((client) => <article key={client.athleteId} className="rounded-xl border border-zinc-800 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{client.name}</h2><p className="mt-1 text-sm text-zinc-500">{client.workoutsThisWeek} workout{client.workoutsThisWeek === 1 ? "" : "s"} this week</p></div><span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold uppercase">Active</span></div><div className="mt-4 rounded-lg bg-zinc-900 p-4"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Latest Workout</p><p className="mt-1 font-semibold">{client.latestWorkout ?? "No completed workouts"}</p>{client.latestWorkoutAt && <p className="mt-1 text-xs text-zinc-500">{new Date(client.latestWorkoutAt).toLocaleString()}</p>}</div></article>)}</section></main>;
}
