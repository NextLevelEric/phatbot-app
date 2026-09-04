"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { RebuildDashboardStatus } from "@/components/RebuildDashboardStatus";

type Profile = { display_name: string | null };
type WorkoutTemplate = { id: string; name: string; description: string | null; created_at: string; sort_order: number | null };
type WorkoutSession = { id: string; workout_id: string; workout_name_snapshot: string; completed_at: string };
type ActiveWorkout = { id: string; workout_name_snapshot: string; started_at: string };
type CoachFeedback = { workout_session_id: string; feedback: string; updated_at: string; workout_name: string | null };
type PlateauSignal = { exercise_id: string; exercise_name: string; consecutive_flat_sessions: number; change_percent: number | null };
type SignalRead = { signal_kind: "win" | "training"; signal_key: string };

function trainingSignalKey(signal: PlateauSignal) {
  return `${signal.exercise_id}:${signal.consecutive_flat_sessions}`;
}

function athleteFacingDescription(description: string | null) {
  if (!description) return null;
  if (/^Imported by coach\s+[0-9a-f-]{20,}$/i.test(description.trim())) return "Assigned by your coach";
  return description;
}

function DumbbellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 28" className="h-8 w-12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M14 14h16M10 7v14M34 7v14M6 10v8M38 10v8" />
    </svg>
  );
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  const [latestWorkout, setLatestWorkout] = useState<WorkoutSession | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [latestCoachFeedback, setLatestCoachFeedback] = useState<CoachFeedback | null>(null);
  const [plateauSignals, setPlateauSignals] = useState<PlateauSignal[]>([]);

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function load() {
      if (mounted) {
        setLoading(true);
        setLoadError(null);
      }

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!mounted) return;

        if (!session?.user) {
          setSignedIn(false);
          setLoading(false);
          window.location.replace("/auth");
          return;
        }

        const user = session.user;
        setSignedIn(true);

        const [profileResult, templatesResult, latestResult, activeResult, feedbackResult, plateauResult, readsResult] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", user.id).single(),
          supabase.from("workouts").select("id,name,description,created_at,sort_order").eq("athlete_user_id", user.id).eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
          supabase.from("workout_sessions").select("id,workout_id,workout_name_snapshot,completed_at").eq("athlete_user_id", user.id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("workout_sessions").select("id,workout_name_snapshot,started_at").eq("athlete_user_id", user.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("coach_workout_feedback").select("workout_session_id,feedback,updated_at").eq("athlete_user_id", user.id).is("athlete_read_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("exercise_plateau_signals").select("exercise_id,exercise_name,consecutive_flat_sessions,change_percent").eq("athlete_user_id", user.id).eq("status", "active").order("consecutive_flat_sessions", { ascending: false }).limit(10),
          supabase.from("athlete_signal_reads").select("signal_kind,signal_key").eq("athlete_user_id", user.id).eq("signal_kind", "training"),
        ]);

        const criticalError = templatesResult.error || latestResult.error || activeResult.error;
        if (criticalError) throw criticalError;

        let feedback: CoachFeedback | null = null;
        if (feedbackResult.data) {
          const { data: workout } = await supabase.from("workout_sessions").select("workout_name_snapshot").eq("id", feedbackResult.data.workout_session_id).eq("athlete_user_id", user.id).maybeSingle();
          feedback = { ...feedbackResult.data, workout_name: workout?.workout_name_snapshot ?? null } as CoachFeedback;
        }

        const readKeys = new Set(((readsResult.data ?? []) as SignalRead[]).map((read) => read.signal_key));
        if (!mounted) return;

        setProfile(profileResult.data);
        setWorkoutTemplates((templatesResult.data ?? []) as WorkoutTemplate[]);
        setLatestWorkout(latestResult.data as WorkoutSession | null);
        setActiveWorkout(activeResult.data as ActiveWorkout | null);
        setLatestCoachFeedback(feedback);
        setPlateauSignals(((plateauResult.data ?? []) as PlateauSignal[]).filter((signal) => !readKeys.has(trainingSignalKey(signal))).slice(0, 2));
        setLoading(false);
      } catch (error) {
        console.error("Dashboard load failed", error);
        if (mounted) {
          setLoadError("PHATBOT couldn't load your training data.");
          setLoading(false);
        }
      }
    }

    void load();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSignedIn(false);
        setLoadError(null);
        setLoading(false);
        window.location.replace("/auth");
        return;
      }
      void load();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function markTrainingSignalRead(signal: PlateauSignal) {
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("athlete_signal_reads").upsert({
      athlete_user_id: user.id,
      signal_kind: "training",
      signal_key: trainingSignalKey(signal),
      read_at: new Date().toISOString(),
    }, { onConflict: "athlete_user_id,signal_kind,signal_key" });

    setPlateauSignals((current) => current.filter((item) => trainingSignalKey(item) !== trainingSignalKey(signal)));
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-12">
        <p className="text-xs font-bold uppercase tracking-[.25em] text-[#ff0032]">PHATBOT</p>
        <h1 className="text-2xl font-black">Loading your training data...</h1>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-900"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#ff0032]" /></div>
        <p className="text-sm text-zinc-400">Beep boop. Checking workouts, coaching signals, and recent performance.</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6 py-12">
        <div className="rounded-2xl border border-[#ff0032]/50 bg-[#ff0032]/5 p-6">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">PHATBOT CONNECTION ERROR</p>
          <h1 className="mt-2 text-2xl font-black">Training data didn't load.</h1>
          <p className="mt-3 text-zinc-300">{loadError} Your data has not been changed.</p>
          <button onClick={() => window.location.reload()} className="mt-5 w-full rounded-lg bg-[#ff0032] px-5 py-3 font-bold text-white">Try Again</button>
        </div>
      </main>
    );
  }

  if (!signedIn) return null;

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  const trainHref = activeWorkout ? `/sessions/${activeWorkout.id}` : "/workouts";
  const visibleTemplates = workoutTemplates.slice(0, 2);
  const hasAttention = Boolean(latestCoachFeedback || plateauSignals.length > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT</p>
        <h1 className="mt-2 text-3xl font-black">{firstName ? `Ready, ${firstName}?` : "Ready to train?"}</h1>
        <p className="mt-2 text-sm text-zinc-400">Train. Track. Improve.</p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">{activeWorkout ? "Workout in progress" : "Today's mission"}</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">{activeWorkout ? activeWorkout.workout_name_snapshot : "What are we training?"}</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-400">{activeWorkout ? "Your session is saved. PHATBOT is ready to pick up exactly where you left off." : "Choose a workout and give PHATBOT something to analyze."}</p>
          </div>
          <div className="shrink-0 text-[#ff0032]"><DumbbellIcon /></div>
        </div>

        <Link href={trainHref} className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#ff0032] px-5 py-4 text-base font-black text-white shadow-lg transition active:scale-[.99]">
          <DumbbellIcon />
          <span>{activeWorkout ? "Resume PHATBOT Train" : "PHATBOT Train"}</span>
        </Link>
      </section>

      {hasAttention && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT Signals</p>
              <h2 className="mt-1 text-xl font-black">Needs your attention</h2>
            </div>
          </div>

          {latestCoachFeedback && (
            <Link href={`/sessions/${latestCoachFeedback.workout_session_id}/report`} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition active:bg-zinc-900">
              <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Coach Transmission</p>
              <p className="mt-2 font-black">New feedback{latestCoachFeedback.workout_name ? ` on ${latestCoachFeedback.workout_name}` : ""}</p>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{latestCoachFeedback.feedback}</p>
              <p className="mt-3 text-sm font-black text-white">Read transmission →</p>
            </Link>
          )}

          {plateauSignals.map((signal) => (
            <Link key={trainingSignalKey(signal)} href={`/progress/exercises?exercise=${encodeURIComponent(signal.exercise_id)}`} onClick={() => void markTrainingSignalRead(signal)} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition active:bg-zinc-900">
              <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Training Signal</p>
              <p className="mt-2 font-black">{signal.exercise_name} has gone flat.</p>
              <p className="mt-2 text-sm text-zinc-400">{signal.consecutive_flat_sessions} flat sessions detected. PHATBOT recommends a closer look.</p>
            </Link>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link href="/progress" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition active:bg-zinc-900">
          <div className="flex h-7 items-end gap-1" aria-hidden="true">
            <span className="h-2 w-2.5 rounded-sm bg-white" />
            <span className="h-4 w-2.5 rounded-sm bg-white" />
            <span className="h-7 w-2.5 rounded-sm bg-[#ff0032]" />
          </div>
          <p className="mt-4 text-sm font-black">Progress</p>
          <p className="mt-1 text-xs text-zinc-500">Scores, PRs & trends</p>
        </Link>

        <Link href="/compete" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition active:bg-zinc-900">
          <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5h14v5c0 6-3.1 10-7 10s-7-4-7-10V5Z" /><path d="M9 7H5v3c0 4 2.4 6.5 6 7.2M23 7h4v3c0 4-2.4 6.5-6 7.2" /><path d="M16 20v5M11 28h10M13 25h6" />
          </svg>
          <p className="mt-4 text-sm font-black">Compete</p>
          <p className="mt-1 text-xs text-zinc-500">Awards & leaderboard</p>
        </Link>
      </section>

      {latestWorkout && (
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Last workout</p>
              <h2 className="mt-1 text-xl font-black">{latestWorkout.workout_name_snapshot}</h2>
            </div>
            <Link href={`/sessions/${latestWorkout.id}/report`} className="text-sm font-black text-zinc-300">Report →</Link>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Completed {new Date(latestWorkout.completed_at).toLocaleString()}</p>
        </section>
      )}

      {!activeWorkout && workoutTemplates.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">Quick start</p>
              <h2 className="mt-1 text-xl font-black">Your workouts</h2>
            </div>
            <Link href="/workouts" className="text-sm font-black text-zinc-300">View all →</Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {visibleTemplates.map((workout) => {
              const description = athleteFacingDescription(workout.description);
              return (
                <Link key={workout.id} href={`/workouts/${workout.id}`} className="rounded-2xl border border-zinc-800 p-5 transition active:bg-zinc-900">
                  <h3 className="text-lg font-black">{workout.name}</h3>
                  {description && <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{description}</p>}
                  <p className="mt-4 text-sm font-black text-[#ff0032]">Open →</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <RebuildDashboardStatus />
    </main>
  );
}
