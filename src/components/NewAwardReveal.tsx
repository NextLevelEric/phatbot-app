"use client";

import { useEffect, useState } from "react";
import CompetitionShareCard from "@/components/CompetitionShareCard";
import CompetitionAwardArtwork from "@/components/CompetitionAwardArtwork";
import { resolveLeaderboardIdentity, type LeaderboardIdentityMode } from "@/features/competition/share";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Competition = "beast" | "eager_beaver" | "cardio_bunny" | "step_king";
type Cadence = "daily" | "weekly";
type Award = { id: string; period_id: string; competition: Competition; cadence: Cadence; result: string | null; score: number | null; coWinner: boolean | null };
type AwardRow = { id: string; period_id: string; award_key: string; awarded_at: string };
type RevealRow = { award_id: string };
type LeaderboardRow = { rank: number | null };

const hardware: Record<Competition, string> = { beast: "Beast Medallion", eager_beaver: "Golden Log", cardio_bunny: "Golden Carrot", step_king: "Golden Crown" };

function fmt(competition: Competition, score: number) {
  if (competition === "step_king") return `${Math.round(score).toLocaleString()} steps`;
  if (competition === "eager_beaver") return `${score.toFixed(1)} Eager`;
  return `${score >= 0 ? "+" : ""}${score.toFixed(1)}%`;
}

export default function NewAwardReveal() {
  const [award, setAward] = useState<Award | null>(null);
  const [athleteName, setAthleteName] = useState("PHATBOT Athlete");
  const [stage, setStage] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const [{ data: athleteProfile }, { data: profile }, { data: rawData }] = await Promise.all([
        supabase.from("athlete_profiles").select("leaderboard_identity_mode,leaderboard_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.from("competition_awards").select("id,period_id,award_key,awarded_at").eq("athlete_user_id", user.id).order("awarded_at", { ascending: false }).limit(20),
      ]);
      setAthleteName(resolveLeaderboardIdentity({
        mode: athleteProfile?.leaderboard_identity_mode as LeaderboardIdentityMode | null | undefined,
        customName: athleteProfile?.leaderboard_name,
        profileName: profile?.display_name,
      }));

      const raw = (rawData ?? []) as AwardRow[];
      const awardIds = raw.map(item => item.id);
      let seenRows: RevealRow[] = [];
      if (awardIds.length) {
        const revealTable = (supabase as any).from("competition_award_reveals");
        const { data } = await revealTable.select("award_id").eq("athlete_user_id", user.id).in("award_id", awardIds);
        seenRows = (data ?? []) as RevealRow[];
      }
      const seenIds = new Set(seenRows.map(row => row.award_id));

      for (const item of raw) {
        if (seenIds.has(item.id)) continue;
        const { data: period } = await supabase.from("competition_periods").select("competition,cadence,status").eq("id", item.period_id).maybeSingle();
        if (!period || period.status !== "finalized") continue;
        const [{ data: entry }, { data: board, error: boardError }] = await Promise.all([
          supabase.from("competition_entries").select("score,result_label").eq("period_id", item.period_id).eq("athlete_user_id", user.id).maybeSingle(),
          supabase.rpc("competition_leaderboard", { p_period_id: item.period_id }),
        ]);
        setAward({
          id: item.id,
          period_id: item.period_id,
          competition: period.competition as Competition,
          cadence: period.cadence as Cadence,
          result: entry?.result_label ?? null,
          score: entry?.score ?? null,
          coWinner: boardError ? null : ((board ?? []) as LeaderboardRow[]).filter(row => row.rank === 1).length > 1,
        });
        break;
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!award) return;
    setStage(0);
    const appear = setTimeout(() => setStage(1), 250);
    const reveal = setTimeout(() => setStage(2), 850);
    return () => { clearTimeout(appear); clearTimeout(reveal); };
  }, [award]);

  if (!award) return null;
  const result = award.result ?? (award.score != null ? fmt(award.competition, award.score) : "Champion");

  async function close() {
    const current = award;
    if (!current) return;
    setAward(null);
    try {
      if (userId) {
        const supabase = createSupabaseBrowserClient();
        const revealTable = (supabase as any).from("competition_award_reveals");
        const { error } = await revealTable.upsert({ award_id: current.id, athlete_user_id: userId }, { onConflict: "award_id" });
        if (error) throw error;
      }
    } catch {
      try { localStorage.setItem(`phatbot-award-revealed:${current.id}`, "1"); } catch {}
    }
  }

  return <div className="phat-force-dark fixed inset-0 z-[100] flex items-center justify-center bg-black/95 px-5 backdrop-blur-md">
    <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute left-[10%] top-[12%] text-3xl text-yellow-300/50">✦</div><div className="absolute right-[12%] top-[22%] text-xl text-yellow-300/40">✦</div><div className="absolute bottom-[18%] left-[18%] text-2xl text-yellow-300/30">✦</div><div className="absolute bottom-[28%] right-[15%] text-4xl text-yellow-300/20">✦</div></div>
    <div className={`relative w-full max-w-md text-center transition-all duration-700 ${stage ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}>
      <p className="text-xs font-black uppercase tracking-[.34em] text-[#ff0032]">PHATBOT COMPETE</p>
      <p className="mt-4 text-sm font-black uppercase tracking-[.24em] text-yellow-400">{award.cadence === "weekly" ? "Legendary Hardware" : "Hardware Acquired"}</p>
      <div className={`mt-8 flex justify-center transition-all duration-700 ${stage >= 2 ? "scale-100 opacity-100" : "scale-75 opacity-20"}`}><CompetitionAwardArtwork competition={award.competition} className="h-52 w-full max-w-xs" /></div>
      <h1 className="mt-8 text-4xl font-black tracking-tight text-white">YOU WON.</h1>
      <h2 className="mt-2 text-3xl font-black text-yellow-300">{hardware[award.competition]}</h2>
      {award.coWinner && <p className="mt-2 text-xs font-black uppercase tracking-[.18em] text-yellow-500">Shared first · Co-champion</p>}
      <p className="mt-5 text-2xl font-black text-white">{result}</p>
      <p className="mt-2 text-sm text-zinc-500">Finalized. Locked. Added to your Trophy Cabinet.</p>
      <div className="mt-6"><CompetitionShareCard competition={award.competition} cadence={award.cadence} winnerName={athleteName} result={result} isMine mode="award" rank={1} finalized coWinner={award.coWinner}/></div>
      <button type="button" onClick={() => void close()} className="mt-7 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-black">CLAIM HARDWARE →</button>
      <button type="button" onClick={() => void close()} className="mt-3 px-5 py-2 text-xs font-bold text-zinc-600">Continue to the arena</button>
    </div>
  </div>;
}
