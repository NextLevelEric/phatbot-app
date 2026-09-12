"use client";

import { useEffect, useState } from "react";
import ChampionshipSunday from "@/components/ChampionshipSunday";
import CompetitionAwardArtwork from "@/components/CompetitionAwardArtwork";
import CompetitionAutoRefresh from "@/components/CompetitionAutoRefresh";
import CompetitionShareCard from "@/components/CompetitionShareCard";
import MondayKickoff from "@/components/MondayKickoff";
import PersonalCompetitionStatusCard from "@/components/PersonalCompetitionStatusCard";
import {
  buildBeastStatusPair,
  selectAroundYouRows,
  type CompetitionCadence as Cadence,
  type CompetitionKind as Competition,
  type CompetitionLeaderboardRow as Row,
  type CompetitionPeriodRecord as Period,
  type CompetitionStatusQuery,
} from "@/features/competition/personalStatus";
import { selectLatestEarnedAward } from "@/features/competition/awardArt";
import { resolveLeaderboardIdentity } from "@/features/competition/share";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Award = { id: string; period_id: string; award_key: string; awarded_at: string };
type AwardDetail = Award & { competition: Competition; cadence: Cadence; period_start: string; result: string | null; score: number | null; coWinner: boolean | null };

const labels: Record<Competition, string> = { beast: "Beast", eager_beaver: "Eager Beaver", cardio_bunny: "Cardio Bunny", step_king: "Step King" };
const hardware: Record<Competition, string> = { beast: "Beast Medallion", eager_beaver: "Golden Log", cardio_bunny: "Golden Carrot", step_king: "Golden Crown" };
const metricDescriptions: Record<Competition, string> = {
  beast: "Eligible workout improvement",
  eager_beaver: "Progressive-overload consistency",
  cardio_bunny: "Comparable cardio improvement",
  step_king: "Apple Health steps",
};
const order: Competition[] = ["beast", "eager_beaver", "cardio_bunny", "step_king"];

function fmt(competition: Competition, score: number) {
  if (competition === "step_king") return `${Math.round(score).toLocaleString()} steps`;
  if (competition === "eager_beaver") return `${score.toFixed(1)} Eager`;
  return `${score >= 0 ? "+" : ""}${score.toFixed(1)}%`;
}

function podium(rank: number | null) { return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank ? `#${rank}` : "—"; }
function awardDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function rarity(cadence: Cadence) { return cadence === "weekly" ? "LEGENDARY" : "GOLD"; }

function LeaderboardRows({ rows, competition }: { rows: readonly Row[]; competition: Competition }) {
  return <>{rows.map(row => <div key={row.athlete_user_id} className={`grid grid-cols-[54px_1fr_auto] items-center gap-3 border-b border-zinc-900 px-4 py-4 last:border-0 ${row.is_me ? "bg-[#ff0032]/8" : ""}`}><div className="text-center text-lg font-black">{podium(row.rank)}</div><div><p className={`font-black ${row.is_me ? "text-[#ff0032]" : ""}`}>{row.display_name}{row.is_me ? " · YOU" : ""}</p><p className="mt-1 text-xs text-zinc-600">{row.result_label ?? fmt(competition, row.score)}</p></div><p className="text-sm font-black text-zinc-400">{fmt(competition, row.score)}</p></div>)}</>;
}

export default function CompetePage() {
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [competition, setCompetition] = useState<Competition>("beast");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [boards, setBoards] = useState<Record<string, Row[]>>({});
  const [boardErrors, setBoardErrors] = useState<Record<string, boolean>>({});
  const [periodQueryFailed, setPeriodQueryFailed] = useState(false);
  const [awards, setAwards] = useState<AwardDetail[]>([]);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [selectedAward, setSelectedAward] = useState<AwardDetail | null>(null);
  const [athleteShareName, setAthleteShareName] = useState("PHATBOT Athlete");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/auth"; return; }

        const [{ data: athleteProfile }, { data: profile }] = await Promise.all([
          supabase.from("athlete_profiles").select("leaderboard_identity_mode,leaderboard_name").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        ]);
        setAthleteShareName(resolveLeaderboardIdentity({
          mode: athleteProfile?.leaderboard_identity_mode,
          customName: athleteProfile?.leaderboard_name,
          profileName: profile?.display_name,
        }));

        const { data: periodData, error: periodError } = await supabase.from("competition_periods")
          .select("id,competition,cadence,period_start,period_end,reconcile_at,status")
          .in("status", ["open", "reconciling", "finalized"])
          .order("period_start", { ascending: false });
        if (periodError) { setPeriodQueryFailed(true); return; }

        const latest = new Map<string, Period>();
        for (const candidate of (periodData ?? []) as Period[]) {
          const key = `${candidate.competition}:${candidate.cadence}`;
          if (!latest.has(key)) latest.set(key, candidate);
        }

        const nextBoards: Record<string, Row[]> = {};
        const nextBoardErrors: Record<string, boolean> = {};
        await Promise.all(Array.from(latest.values()).map(async candidate => {
          const key = `${candidate.competition}:${candidate.cadence}`;
          const { data, error } = await supabase.rpc("competition_leaderboard", { p_period_id: candidate.id });
          if (error) nextBoardErrors[key] = true;
          else nextBoards[key] = (data ?? []) as Row[];
        }));

        const { data: awardData } = await supabase.from("competition_awards")
          .select("id,period_id,award_key,awarded_at")
          .eq("athlete_user_id", user.id)
          .order("awarded_at", { ascending: false })
          .limit(100);
        const rawAwards = (awardData ?? []) as Award[];
        const periodIds = [...new Set(rawAwards.map(award => award.period_id))];
        let details: AwardDetail[] = [];
        if (periodIds.length) {
          const { data: history } = await supabase.from("competition_periods").select("id,competition,cadence,period_start").in("id", periodIds);
          const { data: entries } = await supabase.from("competition_entries").select("period_id,score,result_label").eq("athlete_user_id", user.id).in("period_id", periodIds);
          const periodMap = new Map((history ?? []).map(item => [item.id, item]));
          const entryMap = new Map((entries ?? []).map(item => [item.period_id, item]));
          details = rawAwards.map(award => {
            const awardPeriod = periodMap.get(award.period_id);
            const entry = entryMap.get(award.period_id);
            const rawKey = award.award_key.replace(/_(daily|weekly)$/, "");
            return {
              ...award,
              competition: (awardPeriod?.competition ?? (order.includes(rawKey as Competition) ? rawKey : "beast")) as Competition,
              cadence: (awardPeriod?.cadence ?? (award.award_key.endsWith("weekly") ? "weekly" : "daily")) as Cadence,
              period_start: awardPeriod?.period_start ?? award.awarded_at,
              result: entry?.result_label ?? null,
              score: entry?.score ?? null,
              coWinner: null,
            };
          });
        }
        setAwards(details);
        setPeriods(Array.from(latest.values()));
        setBoards(nextBoards);
        setBoardErrors(nextBoardErrors);
      } catch {
        setPeriodQueryFailed(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function statusQuery(statusCadence: Cadence): CompetitionStatusQuery {
    if (loading) return { state: "loading" };
    if (periodQueryFailed) return { state: "error" };
    const statusPeriod = periods.find(item => item.competition === "beast" && item.cadence === statusCadence) ?? null;
    const key = `beast:${statusCadence}`;
    if (statusPeriod && boardErrors[key]) return { state: "error" };
    return { state: "success", period: statusPeriod, rows: boards[key] ?? [] };
  }

  async function openAward(award: AwardDetail) {
    setSelectedAward({ ...award, coWinner: null });
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("competition_leaderboard", { p_period_id: award.period_id });
      if (error) return;
      const coWinner = ((data ?? []) as Row[]).filter(row => row.rank === 1).length > 1;
      setSelectedAward(current => current?.id === award.id ? { ...current, coWinner } : current);
    } catch {
      // Keep the share copy generically truthful if tie details cannot be loaded.
    }
  }

  const beastStatus = buildBeastStatusPair({ daily: statusQuery("daily"), weekly: statusQuery("weekly") });
  const period = periods.find(item => item.competition === competition && item.cadence === cadence) ?? null;
  const boardKey = `${competition}:${cadence}`;
  const board = boards[boardKey] ?? [];
  const topRows = board.slice(0, 10);
  const aroundYouRows = selectAroundYouRows(board);
  const boardFailed = !!boardErrors[boardKey] || periodQueryFailed;
  const leader = board.find(row => row.rank === 1) ?? board[0] ?? null;
  const athleteRow = board.find(row => row.is_me) ?? null;
  const currentCoWinner = board.filter(row => row.rank === 1).length > 1;
  const wonCurrent = !!period && awards.some(award => award.period_id === period.id);
  const counts = order.map(key => ({ key, count: awards.filter(award => award.competition === key).length }));

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-7 px-4 py-7 sm:px-6 sm:py-10">
    <header>
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Compete</p>
      <h1 className="mt-2 text-4xl font-black">Your arena.</h1>
      <p className="mt-2 text-zinc-400">Where you stand today, where you stand this week, and who is ahead.</p>
    </header>

    <section aria-labelledby="my-competition-status">
      <p className="text-xs font-black uppercase tracking-[.2em] text-zinc-500">Athlete first</p>
      <h2 id="my-competition-status" className="mt-1 text-2xl font-black">My Competition Status</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PersonalCompetitionStatusCard status={beastStatus.today} shareName={athleteShareName} />
        <PersonalCompetitionStatusCard status={beastStatus.thisWeek} shareName={athleteShareName} />
      </div>
    </section>

    <section aria-labelledby="award-overview" className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">All competitions</p><h2 id="award-overview" className="mt-1 text-2xl font-black">Award Overview</h2></div><p className="text-xs font-bold text-zinc-600">Choose a board</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 p-2">
        <button type="button" onClick={() => setCadence("daily")} className={`rounded-xl py-3 text-sm font-black ${cadence === "daily" ? "bg-white text-black" : "text-zinc-500"}`}>Daily</button>
        <button type="button" onClick={() => setCadence("weekly")} className={`rounded-xl py-3 text-sm font-black ${cadence === "weekly" ? "bg-white text-black" : "text-zinc-500"}`}>Weekly</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {order.map(key => {
          const overviewBoard = boards[`${key}:${cadence}`] ?? [];
          const overviewMe = overviewBoard.find(row => row.is_me) ?? null;
          const failed = !!boardErrors[`${key}:${cadence}`] || periodQueryFailed;
          return <button key={key} type="button" onClick={() => setCompetition(key)} className={`min-h-28 rounded-2xl border p-3 text-left transition-colors ${competition === key ? "border-yellow-500 bg-yellow-500/10" : "border-zinc-800 bg-black hover:border-zinc-700"}`}>
            <div className="flex items-start justify-between gap-2"><p className={`text-sm font-black ${competition === key ? "text-yellow-400" : "text-white"}`}>{labels[key]}</p><p className="text-lg font-black">{loading ? "—" : failed ? "!" : overviewMe?.rank ? `#${overviewMe.rank}` : "—"}</p></div>
            <p className="mt-2 text-[10px] font-bold leading-4 text-zinc-600">{metricDescriptions[key]}</p>
            <p className="mt-2 text-xs font-black text-zinc-400">{loading ? "Reading board..." : failed ? "Unavailable" : overviewMe ? overviewMe.result_label ?? fmt(key, overviewMe.score) : "Not ranked yet"}</p>
          </button>;
        })}
      </div>
      <details className="mt-3 rounded-2xl border border-zinc-800 bg-black/50 px-4 py-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[.16em] text-zinc-500">Competition schedule and weekly context</summary>
        <div className="-mx-4 -mb-3 mt-3 overflow-hidden border-t border-zinc-800 [&>div]:px-4 [&>div]:pt-4 [&>div]:sm:px-4 [&>div]:sm:pt-4">
          <MondayKickoff />
          <ChampionshipSunday />
        </div>
      </details>
    </section>

    <section aria-labelledby="leaderboard-detail">
      <div className="mb-3 flex justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Leaderboard Detail</p><h2 id="leaderboard-detail" className="mt-1 text-2xl font-black">{labels[competition]} · {cadence === "daily" ? "Today" : "This Week"}</h2></div><p className="text-xs capitalize text-zinc-600">{period?.status ?? "waiting"}</p></div>
      <CompetitionAutoRefresh embedded />
      {loading ? <div className="mt-3 rounded-2xl border border-zinc-800 p-5 text-zinc-500">Reading the arena...</div>
        : boardFailed ? <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-5"><p className="font-black">This leaderboard is unavailable.</p><p className="mt-2 text-sm leading-6 text-zinc-400">PHATBOT couldn't load the current standings. Your workout data is safe. Try again.</p></div>
        : !period ? <div className="mt-3 rounded-2xl border border-zinc-700 p-5"><p className="font-black">No competition period is available.</p><p className="mt-2 text-sm text-zinc-500">Check back when the next board opens.</p></div>
        : board.length === 0 ? <div className="mt-3 rounded-2xl border border-zinc-800 p-5"><p className="font-black">No eligible athletes yet.</p><p className="mt-2 text-sm text-zinc-500">The board is open. An eligible result will establish the first position.</p></div>
        : <><div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800"><LeaderboardRows rows={topRows} competition={competition} /></div>{aroundYouRows.length > 0 && <section aria-labelledby="around-you" className="mt-4"><div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#ff0032]">Your position</p><h3 id="around-you" className="mt-1 text-lg font-black">Around You</h3></div><p className="text-[10px] text-zinc-600">Nearby rank groups</p></div><div className="overflow-hidden rounded-2xl border border-[#ff0032]/30 bg-zinc-950"><LeaderboardRows rows={aroundYouRows} competition={competition} /></div></section>}</>}
    </section>

    {leader && <section className="rounded-3xl border border-yellow-500/35 bg-gradient-to-br from-yellow-500/10 via-zinc-950 to-black p-6 text-center"><p className="text-xs font-black uppercase tracking-[.22em] text-yellow-400">{period?.status === "finalized" ? "Official Winner" : "Current Leader"}</p><div className="mt-5 flex justify-center"><CompetitionAwardArtwork competition={competition} className="h-32 w-40" /></div><h2 className="mt-4 text-3xl font-black">{leader.display_name}</h2><p className="mt-2 text-lg font-black text-yellow-400">{leader.result_label ?? fmt(competition, leader.score)}</p><p className="mt-2 text-sm text-zinc-500">{period?.status === "finalized" ? "The result is locked. Hardware awarded." : "Live result. The board can still move."}</p></section>}
    {wonCurrent && athleteRow?.rank === 1 && <section className="relative overflow-hidden rounded-3xl border border-yellow-300/60 bg-gradient-to-br from-yellow-400/25 via-zinc-950 to-black p-6 text-center shadow-[0_0_35px_rgba(250,204,21,.08)]"><div className="absolute right-4 top-3 text-yellow-200/20">✦ ✦ ✦</div><p className="text-xs font-black uppercase tracking-[.24em] text-yellow-300">Hardware Acquired</p><div className="mt-5 flex justify-center"><CompetitionAwardArtwork competition={competition} className="h-36 w-44" /></div><h2 className="mt-5 text-3xl font-black">You won {hardware[competition]}.</h2><p className="mt-2 text-xs font-black uppercase tracking-[.18em] text-yellow-500">{rarity(cadence)} · {currentCoWinner ? "Shared First" : cadence === "weekly" ? "Weekly Champion" : "Daily Champion"}</p><CompetitionShareCard competition={competition} cadence={cadence} winnerName={athleteShareName} result={athleteRow.result_label ?? fmt(competition, athleteRow.score)} isMine mode="award" rank={1} finalized coWinner={currentCoWinner} /></section>}

    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
      <button type="button" onClick={() => setCabinetOpen(value => !value)} className="w-full text-left"><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-yellow-500">Your Trophy Cabinet</p><h2 className="mt-1 text-3xl font-black">{awards.length} {awards.length === 1 ? "piece of hardware" : "pieces of hardware"}</h2><p className="mt-2 text-sm text-zinc-500">{cabinetOpen ? "Hide the collection" : "Open the cabinet →"}</p></div><span className="text-3xl">🏆</span></div></button>
      {awards.length > 0 && <div className="mt-5 grid grid-cols-4 gap-2">{counts.map(({ key, count }) => { const shareTarget = selectLatestEarnedAward(awards, key); return <button key={key} type="button" disabled={!shareTarget} onClick={() => shareTarget && void openAward(shareTarget)} aria-label={shareTarget ? `Open and share my latest ${hardware[key]}` : `${hardware[key]} not earned yet`} className={`rounded-xl border bg-black px-2 py-3 text-center ${shareTarget ? "border-yellow-500/35 hover:border-yellow-400" : "cursor-default border-zinc-800 opacity-45"}`}><p className="text-lg font-black text-yellow-400">{count}</p><p className="mt-1 text-[9px] font-black uppercase text-zinc-600">{labels[key]}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-zinc-700">{shareTarget ? "Tap to share" : "Not earned"}</p></button>; })}</div>}
      {cabinetOpen && (awards.length === 0 ? <p className="mt-5 text-sm leading-6 text-zinc-500">Empty cabinet. For now. Finalized wins will collect here automatically.</p> : <div className="mt-5 grid grid-cols-2 gap-3">{awards.map(award => <button key={award.id} type="button" onClick={() => void openAward(award)} className={`relative overflow-hidden rounded-2xl border p-4 text-center ${award.cadence === "weekly" ? "border-yellow-200/60 bg-gradient-to-br from-yellow-400/15 via-black to-black" : "border-yellow-500/20 bg-black"}`}><div className="absolute right-2 top-2 rounded-full border border-yellow-500/25 bg-black/70 px-2 py-1 text-[8px] font-black tracking-[.14em] text-yellow-500">{rarity(award.cadence)}</div><div className="flex h-24 items-center justify-center"><CompetitionAwardArtwork competition={award.competition} className="h-24 w-28" /></div><p className="mt-1 text-sm font-black">{hardware[award.competition]}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.12em] text-zinc-600">{award.cadence === "weekly" ? "Weekly Champion" : "Daily Champion"}</p><p className="mt-2 text-xs font-bold text-yellow-500">{award.result ?? (award.score != null ? fmt(award.competition, award.score) : "WIN")}</p><p className="mt-1 text-[10px] text-zinc-700">Earned {awardDate(award.period_start)}</p></button>)}</div>)}
    </section>

    {selectedAward && <section className="relative overflow-hidden rounded-3xl border border-yellow-300/55 bg-gradient-to-br from-yellow-400/20 via-zinc-950 to-black p-6 text-center shadow-[0_0_40px_rgba(250,204,21,.08)]"><div className="absolute left-5 top-4 rounded-full border border-yellow-400/30 bg-black/60 px-3 py-1 text-[9px] font-black tracking-[.18em] text-yellow-400">{rarity(selectedAward.cadence)}</div><button type="button" onClick={() => setSelectedAward(null)} className="absolute right-4 top-4 rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-400">×</button><p className="mt-8 text-xs font-black uppercase tracking-[.22em] text-yellow-400">Hardware Acquired</p><div className="mt-5 flex justify-center"><CompetitionAwardArtwork competition={selectedAward.competition} className="h-48 w-full max-w-xs" /></div><h2 className="mt-5 text-3xl font-black">{hardware[selectedAward.competition]}</h2><p className="mt-2 text-sm font-black uppercase tracking-[.14em] text-yellow-500">{selectedAward.coWinner ? "Shared First" : selectedAward.cadence === "weekly" ? "Weekly Champion" : "Daily Champion"}</p><p className="mt-1 text-xs text-zinc-600">Earned {awardDate(selectedAward.period_start)}</p><p className="mt-4 text-2xl font-black">{selectedAward.result ?? (selectedAward.score != null ? fmt(selectedAward.competition, selectedAward.score) : "Hardware acquired")}</p><div className="mt-5"><CompetitionShareCard competition={selectedAward.competition} cadence={selectedAward.cadence} winnerName={athleteShareName} result={selectedAward.result ?? (selectedAward.score != null ? fmt(selectedAward.competition, selectedAward.score) : "Champion")} isMine mode="award" rank={1} finalized coWinner={selectedAward.coWinner} buttonLabel="Share hardware" /></div></section>}

    <p className="pb-2 text-center text-[11px] text-zinc-700">Live boards are provisional until finalization. Tied leaders share first place and each earn the award.</p>
  </main>;
}
