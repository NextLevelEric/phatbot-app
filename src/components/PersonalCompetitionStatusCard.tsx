import type { PersonalCompetitionStatus } from "@/features/competition/personalStatus";

type Props = { status: PersonalCompetitionStatus };

const stateStyles: Record<PersonalCompetitionStatus["state"], string> = {
  loading: "border-zinc-800 bg-zinc-950",
  error: "border-red-500/45 bg-red-500/5",
  unavailable: "border-zinc-700 bg-zinc-950",
  empty: "border-zinc-700 bg-zinc-950",
  unranked: "border-yellow-500/35 bg-yellow-500/5",
  ranked: "border-[#ff0032]/45 bg-gradient-to-br from-[#ff0032]/10 via-zinc-950 to-black",
};

export default function PersonalCompetitionStatusCard({ status }: Props) {
  const weekly = status.cadence === "weekly";
  const rankedCount = status.rankedAthleteCount;

  return (
    <article className={`relative overflow-hidden rounded-3xl border p-5 ${stateStyles[status.state]}`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${weekly ? "bg-yellow-400" : "bg-[#ff0032]"}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-black uppercase tracking-[.24em] ${weekly ? "text-yellow-400" : "text-[#ff0032]"}`}>
            {status.heading}
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[.14em] text-zinc-600">Beast</p>
          <h3 className={`mt-3 font-black tracking-tight ${status.periodState === "finalized" ? "text-3xl" : status.athlete ? "text-5xl" : "text-3xl"}`}>
            {status.rankDisplay}
          </h3>
          {rankedCount !== null && (
            <p className="mt-2 text-sm font-bold text-zinc-500">
              {status.athlete
                ? `#${status.athlete.rank} of ${rankedCount} ranked ${rankedCount === 1 ? "athlete" : "athletes"}`
                : `${rankedCount} ranked ${rankedCount === 1 ? "athlete" : "athletes"}`}
            </p>
          )}
        </div>
        {status.athlete && (
          <div className="max-w-[48%] text-right">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-600">Your result</p>
            <p className={`mt-2 text-xl font-black leading-tight ${weekly ? "text-yellow-300" : "text-white"}`}>
              {status.athlete.resultLabel}
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-sm font-semibold leading-6 text-zinc-300">{status.positionCopy}</p>

      {status.gapCopy && (
        <div className={`mt-4 rounded-2xl border p-4 ${status.state === "error" ? "border-red-500/25 bg-red-500/5" : "border-yellow-500/25 bg-yellow-500/5"}`}>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-yellow-400">
            {status.state === "ranked" ? "Distance to next score" : "How to enter"}
          </p>
          <p className="mt-2 text-sm font-semibold leading-6">{status.gapCopy}</p>
        </div>
      )}

      {status.timingCopy.primary && (
        <div className="mt-4 border-t border-zinc-800/80 pt-3">
          <p className="text-xs font-bold leading-5 text-zinc-400">{status.timingCopy.primary}</p>
          {status.timingCopy.secondary && <p className="mt-1 text-[10px] leading-5 text-zinc-600">{status.timingCopy.secondary}</p>}
        </div>
      )}
    </article>
  );
}
