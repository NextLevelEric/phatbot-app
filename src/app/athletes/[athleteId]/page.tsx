"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type RecentWorkout = { name: string; completed_at: string; po_wins: number; opportunities: number };
type AthleteProfile = {
  athlete_user_id: string;
  display_name: string;
  joined_at: string;
  completed_workouts: number;
  workouts_last_30_days: number;
  po_wins_last_30_days: number;
  official_awards: number;
  recent_workouts: RecentWorkout[];
  award_counts: Record<string, number>;
};

const hardware: Record<string, string> = {
  beast: "Beast",
  eager_beaver: "Eager Beaver",
  cardio_bunny: "Cardio Bunny",
  step_king: "Step King",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export default function AthleteProfilePage() {
  const params = useParams<{ athleteId: string }>();
  const athleteId = params.athleteId;
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const s = createSupabaseBrowserClient();
      const { data: { user } } = await s.auth.getUser();
      if (!user) { window.location.href = `/auth?next=${encodeURIComponent(`/athletes/${athleteId}`)}`; return; }
      const { data, error } = await s.rpc("athlete_social_profile", { p_athlete_user_id: athleteId });
      if (!active) return;
      const row = ((data ?? [])[0] ?? null) as AthleteProfile | null;
      if (error || !row) { setPrivateProfile(true); setLoading(false); return; }
      setProfile(row);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [athleteId]);

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-5 py-10 text-zinc-500">Opening athlete profile...</main>;

  if (privateProfile || !profile) return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12 text-center">
    <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Athlete</p>
    <h1 className="mt-3 text-4xl font-black">Private athlete.</h1>
    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">This athlete has not chosen to make their leaderboard identity visible, so PHATBOT keeps their training profile private.</p>
    <Link href="/compete" className="mx-auto mt-7 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-black">← Back to Compete</Link>
  </main>;

  const awards = Object.entries(profile.award_counts ?? {}).filter(([, count]) => count > 0);

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header className="rounded-3xl border border-[#ff0032]/30 bg-gradient-to-br from-[#ff0032]/12 via-zinc-950 to-black p-6">
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Athlete</p>
      <h1 className="mt-2 text-4xl font-black">{profile.display_name}</h1>
      <p className="mt-2 text-sm text-zinc-500">Training on PHATBOT since {new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(profile.joined_at))}.</p>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-zinc-800 bg-black/60 p-3"><p className="text-2xl font-black">{profile.completed_workouts}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-zinc-600">Workouts</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-black/60 p-3"><p className="text-2xl font-black">{profile.workouts_last_30_days}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-zinc-600">Last 30d</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-black/60 p-3"><p className="text-2xl font-black">{profile.official_awards}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-zinc-600">Hardware</p></div>
      </div>
    </header>

    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Official Trophy Cabinet</p>
      <h2 className="mt-1 text-2xl font-black">Global wins only.</h2>
      {awards.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No official PHATBOT hardware yet.</p> : <div className="mt-4 grid grid-cols-2 gap-3">{awards.map(([kind, count]) => <div key={kind} className="rounded-2xl border border-yellow-500/20 bg-black p-4"><p className="text-2xl">🏆</p><p className="mt-2 font-black">{hardware[kind] ?? kind}</p><p className="mt-1 text-xs font-black text-yellow-500">{count} win{count === 1 ? "" : "s"}</p></div>)}</div>}
    </section>

    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Recent Training</p><h2 className="mt-1 text-2xl font-black">How they train.</h2></div><p className="text-sm font-black text-[#ff0032]">{profile.po_wins_last_30_days} PO wins · 30d</p></div>
      {profile.recent_workouts.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No completed training to show yet.</p> : <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">{profile.recent_workouts.map((workout, index) => <div key={`${workout.completed_at}-${index}`} className="flex items-center justify-between gap-4 border-b border-zinc-900 px-4 py-4 last:border-0"><div><p className="font-black">{workout.name}</p><p className="mt-1 text-xs text-zinc-600">{dateLabel(workout.completed_at)}</p></div><p className="text-xs font-black text-zinc-400">{workout.opportunities > 0 ? `${workout.po_wins}/${workout.opportunities} PO` : "Baseline"}</p></div>)}</div>}
      <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 p-4"><p className="font-black">Train like {profile.display_name}</p><p className="mt-1 text-sm text-zinc-500">Workout copying is the next piece. This profile is already structured to become the launch point.</p></div>
    </section>

    <div className="grid grid-cols-2 gap-3"><Link href="/compete" className="rounded-2xl border border-zinc-800 px-4 py-4 text-center text-sm font-black">← Compete</Link><Link href="/groups" className="rounded-2xl border border-zinc-800 px-4 py-4 text-center text-sm font-black">Groups</Link></div>
  </main>;
}
