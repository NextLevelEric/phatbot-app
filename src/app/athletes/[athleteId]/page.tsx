"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type SharedExercise = { exercise_id: string; name: string; position: number; prescribed_set_targets: string[]; target_rounds: number | null; target_duration_seconds_min: number | null; target_duration_seconds_max: number | null; target_distance: number | null; target_distance_unit: string | null };\ntype SharedWorkout = { workout_session_id: string; athlete_user_id: string; athlete_name: string; workout_name: string; completed_at: string; exercises: SharedExercise[] };\ntype RecentWorkout = { session_id: string; name: string; completed_at: string; po_wins: number; opportunities: number };
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
  const [privateProfile, setPrivateProfile] = useState(false);\n  const [preview, setPreview] = useState<SharedWorkout | null>(null);\n  const [previewing, setPreviewing] = useState(false);\n  const [copying, setCopying] = useState(false);\n  const [message, setMessage] = useState("");

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

  async function openWorkout(sessionId: string) {
    setPreviewing(true); setMessage("");
    const s = createSupabaseBrowserClient();
    const { data, error } = await s.rpc("athlete_shared_workout", { p_workout_session_id: sessionId });
    const row = ((data ?? [])[0] ?? null) as SharedWorkout | null;
    if (error || !row) setMessage("That workout is not available to share."); else setPreview(row);
    setPreviewing(false);
  }

  async function copyWorkout() {
    if (!preview) return;
    setCopying(true); setMessage("");
    const s = createSupabaseBrowserClient();
    const { data, error } = await s.rpc("copy_athlete_workout", { p_workout_session_id: preview.workout_session_id });
    if (error || !data) { setMessage(error?.message ?? "Unable to copy workout."); setCopying(false); return; }
    window.location.href = `/workouts/${data}`;
  }

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
      {profile.recent_workouts.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No completed training to show yet.</p> : <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">{profile.recent_workouts.map((workout, index) => <button type="button" disabled={previewing} onClick={() => void openWorkout(workout.session_id)} key={`${workout.completed_at}-${index}`} className="flex w-full items-center justify-between gap-4 border-b border-zinc-900 px-4 py-4 text-left last:border-0 hover:bg-zinc-900/60"><div><p className="font-black">{workout.name}</p><p className="mt-1 text-xs text-zinc-600">{dateLabel(workout.completed_at)} · {workout.opportunities > 0 ? `${workout.po_wins}/${workout.opportunities} PO` : "Baseline"}</p></div><span className="text-zinc-600">→</span></button>)}</div>}
      {message && <p className="mt-4 text-sm text-red-300">{message}</p>}
    </section>

    {preview && <section className="rounded-3xl border border-[#ff0032]/35 bg-black p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Workout Preview</p><h2 className="mt-1 text-2xl font-black">{preview.workout_name}</h2><p className="mt-1 text-sm text-zinc-500">From {preview.athlete_name} · {preview.exercises.length} exercises</p></div><button type="button" onClick={() => setPreview(null)} className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-400">×</button></div><div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">{preview.exercises.map(exercise => <div key={`${exercise.position}-${exercise.exercise_id}`} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-zinc-900 px-4 py-3 last:border-0"><p className="text-xs font-black text-zinc-700">{exercise.position}</p><p className="font-black">{exercise.name}</p><p className="max-w-32 text-right text-xs font-bold text-zinc-500">{exercise.prescribed_set_targets?.length ? exercise.prescribed_set_targets.join(" · ") : exercise.target_rounds ? `${exercise.target_rounds} rounds` : exercise.target_distance ? `${exercise.target_distance} ${exercise.target_distance_unit ?? ""}` : exercise.target_duration_seconds_min ? `${Math.round(exercise.target_duration_seconds_min / 60)} min` : "Open target"}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-zinc-600">Copies the workout structure and targets only. Their weights, reps performed, notes, and history stay private.</p><button type="button" disabled={copying} onClick={() => void copyWorkout()} className="mt-4 w-full rounded-2xl bg-white px-5 py-4 font-black text-black disabled:opacity-50">{copying ? "COPYING..." : "COPY TO MY WORKOUTS"}</button></section>}

    <div className="grid grid-cols-2 gap-3"><Link href="/compete" className="rounded-2xl border border-zinc-800 px-4 py-4 text-center text-sm font-black">← Compete</Link><Link href="/groups" className="rounded-2xl border border-zinc-800 px-4 py-4 text-center text-sm font-black">Groups</Link></div>
  </main>;
}
