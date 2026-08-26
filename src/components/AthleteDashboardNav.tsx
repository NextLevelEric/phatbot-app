import Link from "next/link";

type AthleteDashboardNavProps = {
  activeWorkoutId?: string | null;
};

const secondaryLinks = [
  { href: "/reports", label: "Reports" },
  { href: "/progress", label: "Progress" },
  { href: "/workouts", label: "Workouts" },
  { href: "/account", label: "Account" },
];

export function AthleteDashboardNav({ activeWorkoutId }: AthleteDashboardNavProps) {
  const workoutHref = activeWorkoutId ? `/sessions/${activeWorkoutId}` : "/workouts";

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff0032]">Command Center</p>
        <h2 className="mt-2 text-xl font-bold">Ready when you are.</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={workoutHref} className="rounded-2xl bg-white p-5 text-black transition hover:bg-zinc-200">
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

      <nav aria-label="Athlete quick navigation" className="grid grid-cols-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 sm:hidden">
        {secondaryLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border-r border-zinc-800 px-2 py-3 text-center text-[11px] font-bold text-zinc-300 last:border-r-0 active:bg-zinc-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
