import CompetitionAwardArtwork from "@/components/CompetitionAwardArtwork";
import type { CompetitionCadence, CompetitionKind } from "@/features/competition/personalStatus";

export type CadenceAwardCount = { competition: CompetitionKind; cadence: CompetitionCadence; count: number };
const names: Record<string, string> = { beast: "Beast", eager_beaver: "Eager Beaver", cardio_bunny: "Cardio Bunny", step_king: "Step King" };

export default function OfficialTrophyCabinet({ counts, cadenceCounts }: {
  counts: Record<string, number>;
  cadenceCounts?: CadenceAwardCount[];
}) {
  const awards = cadenceCounts?.filter(award => award.count > 0);
  // Older RPC responses retain their totals; never guess daily/weekly from an aggregate.
  const legacy = Object.entries(counts).filter(([, count]) => count > 0);
  return <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
    <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Official Trophy Cabinet</p>
    <h2 className="mt-1 text-2xl font-black">Global wins only.</h2>
    {(awards ?? legacy).length === 0 ? <p className="mt-4 text-sm text-zinc-500">No official PHATBOT hardware yet.</p> : <div className="mt-4 grid grid-cols-2 gap-3">
      {awards ? awards.map(award => <div key={`${award.competition}-${award.cadence}`} className={`rounded-2xl border bg-black p-4 ${award.cadence === "weekly" ? "border-slate-300/50" : "border-yellow-500/20"}`}>
        <CompetitionAwardArtwork award={award} className="mx-auto h-28 w-full" />
        <p className="mt-2 font-black">{names[award.competition]} of the {award.cadence === "weekly" ? "Week" : "Day"}</p>
        <p className="mt-1 text-xs font-black text-yellow-500">{award.count} win{award.count === 1 ? "" : "s"}</p>
      </div>) : legacy.map(([kind, count]) => <div key={kind} className="rounded-2xl border border-yellow-500/20 bg-black p-4">
        <p className="text-2xl">🏆</p><p className="mt-2 font-black">{names[kind] ?? kind}</p>
        <p className="mt-1 text-xs font-black text-yellow-500">{count} win{count === 1 ? "" : "s"}</p>
      </div>)}
    </div>}
  </section>;
}
