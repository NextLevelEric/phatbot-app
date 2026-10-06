"use client";

export type TrainTogetherCompetition = "beast" | "eager_beaver";

export type TrainTogetherStanding = {
  athlete_user_id: string;
  athlete_name: string;
  workout_session_id: string | null;
  session_status: string | null;
  competition: TrainTogetherCompetition;
  score: number | null;
  result_label: string;
  detail_label: string;
  evidence_count: number;
  rank: number | null;
};

const copy = {
  beast: {
    eyebrow: "BEAST",
    title: "Who is beating themselves hardest?",
    empty: "Log some working sets. PHATBOT is waiting for comparable volume.",
    accent: "text-amber-400",
    border: "border-amber-400/25",
    background: "bg-amber-400/5",
  },
  eager_beaver: {
    eyebrow: "EAGER BEAVER",
    title: "Who is stacking the best PO consistency?",
    empty: "Finish a comparable workout to establish an Eager score.",
    accent: "text-orange-300",
    border: "border-orange-300/25",
    background: "bg-orange-300/5",
  },
} as const;

export default function TrainTogetherCompetitionBoard({
  competition,
  rows,
  me,
  live = false,
}: {
  competition: TrainTogetherCompetition;
  rows: TrainTogetherStanding[];
  me: string | null;
  live?: boolean;
}) {
  const ui = copy[competition];
  return (
    <div className={`rounded-2xl border ${ui.border} ${ui.background} p-4`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[.2em] ${ui.accent}`}>{live ? "LIVE " : ""}{ui.eyebrow}</p>
          <h3 className="mt-1 text-base font-black">{ui.title}</h3>
        </div>
        {live && <span className="text-[10px] font-bold uppercase text-zinc-500">refreshes live</span>}
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-500">{ui.empty}</p>
        ) : rows.map((row) => {
          const hasScore = row.score !== null && row.evidence_count > 0;
          return (
            <div key={row.athlete_user_id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${row.athlete_user_id === me ? "border-[#ff0032]/40 bg-[#ff0032]/5" : "border-zinc-800/80 bg-black/10"}`}>
              <div className="w-7 text-center text-sm font-black">{hasScore && row.rank ? `#${row.rank}` : "—"}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{row.athlete_user_id === me ? "YOU" : row.athlete_name}</p>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {row.detail_label}
                  {row.session_status === "completed" ? " · finished" : " · training"}
                </p>
              </div>
              <div className={`text-right text-sm font-black ${hasScore ? ui.accent : "text-zinc-500"}`}>
                {row.result_label}
                {hasScore && row.session_status !== "completed" && <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-600">provisional</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
