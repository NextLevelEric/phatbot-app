import Link from "next/link";

type AthleteDashboardNavProps = {
  activeWorkoutId?: string | null;
};

export function AthleteDashboardNav({ activeWorkoutId }: AthleteDashboardNavProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Command Center</p>
        <h2 className="mt-2 text-xl font-bold">Ready when you are.</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={activeWorkoutId ? `/sessions/${activeWorkoutId}` : "/workouts"} className="rounded-2xl bg-white p-5 text-black transition hover:bg-zinc-200">
          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Train</p>
          <p className="mt-2 text-xl font-black">{activeWorkoutId ? "Resume Workout" : "Start Workout"} →</p>
          <p className="mt-2 text-sm text-zinc-600">{activeWorkoutId ? "Your active session is saved and waiting." : "Choose today's workout and start training."}</p>
        </Link>
        <Link href="/progress" className="rounded-2xl border border-zinc-700 p-5 transition hover:border-[#ff0032]">
          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Progress</p>
          <p className="mt-2 text-xl font-black">Open Progress Center <span className="text-[#ff0032]">→</span></p>
          <p className="mt-2 text-sm text-zinc-400">Reports, trends, PRs, and performance history live here.</p>
        </Link>
      </div>
    </section>
  );
}
