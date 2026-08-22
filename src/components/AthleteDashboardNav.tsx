import Link from "next/link";

type AthleteDashboardNavProps = {
  activeWorkoutId?: string | null;
  latestWorkoutId?: string | null;
};

const secondaryLinks = [
  { href: "/progress/workouts", label: "Workout Trends", description: "Compare complete workout history." },
  { href: "/progress/exercises", label: "Exercise Trends", description: "Inspect PRs, improvement, and plateaus." },
  { href: "/reports", label: "Reports", description: "Review this week, lifetime, or a custom training range." },
];

export function AthleteDashboardNav({ activeWorkoutId, latestWorkoutId }: AthleteDashboardNavProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Command Center</p>
        <h2 className="mt-2 text-xl font-bold">Where do you want to go?</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={activeWorkoutId ? `/sessions/${activeWorkoutId}` : "/workouts"} className="rounded-2xl bg-white p-5 text-black transition hover:bg-zinc-200">
          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Train</p>
          <p className="mt-2 text-xl font-black">{activeWorkoutId ? "Resume Workout" : "Start Workout"} →</p>
          <p className="mt-2 text-sm text-zinc-600">{activeWorkoutId ? "Your active session is saved and waiting." : "Choose a workout and start stacking wins."}</p>
        </Link>
        <Link href="/progress" className="rounded-2xl border border-zinc-700 p-5 transition hover:border-[#ff0032]">
          <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Progress</p>
          <p className="mt-2 text-xl font-black">Open Progress Center <span className="text-[#ff0032]">→</span></p>
          <p className="mt-2 text-sm text-zinc-400">See strength, workout, and exercise telemetry.</p>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {secondaryLinks.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-zinc-800 p-4 transition hover:border-zinc-600"><p className="font-bold">{item.label} <span className="text-[#ff0032]">→</span></p><p className="mt-2 text-xs leading-5 text-zinc-500">{item.description}</p></Link>)}
      </div>

      {latestWorkoutId && <Link href={`/sessions/${latestWorkoutId}/report`} className="text-sm font-semibold text-zinc-300 underline decoration-zinc-600 underline-offset-4">Open latest workout report →</Link>}
    </section>
  );
}
