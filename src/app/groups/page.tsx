"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Competition = "beast" | "eager_beaver" | "step_king";
type Cadence = "daily" | "weekly";
type Group = { id: string; name: string; join_code: string; owner_user_id: string; created_at: string };
type Member = { group_id: string; athlete_user_id: string; role: string; joined_at: string };
type Period = { id: string; competition: Competition; cadence: Cadence; period_start: string; status: string };
type Row = { rank: number; athlete_user_id: string; display_name: string; score: number; result_label: string | null; is_me: boolean };

const competitions: Competition[] = ["beast", "eager_beaver", "step_king"];
const labels: Record<Competition, string> = { beast: "Beast", eager_beaver: "Eager Beaver", step_king: "Step King" };
const PUBLIC_APP_ORIGIN = "https://app.phatbotfit.com";

function formatScore(kind: Competition, row: Row) {
  if (row.result_label) return row.result_label;
  if (kind === "step_king") return `${Math.round(row.score).toLocaleString()} steps`;
  if (kind === "eager_beaver") return `${row.score.toFixed(1)} Eager`;
  return `${row.score >= 0 ? "+" : ""}${row.score.toFixed(1)}%`;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [competition, setCompetition] = useState<Competition>("beast");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [board, setBoard] = useState<Row[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  async function loadGroups(preferred?: string) {
    const s = createSupabaseBrowserClient();
    const { data: membershipData } = await s.from("athlete_group_members").select("group_id,athlete_user_id,role,joined_at").order("joined_at");
    const nextMembers = (membershipData ?? []) as Member[];
    setMembers(nextMembers);
    const ids = [...new Set(nextMembers.map(m => m.group_id))];
    if (!ids.length) { setGroups([]); setSelected(null); return; }
    const { data } = await s.from("athlete_groups").select("id,name,join_code,owner_user_id,created_at").in("id", ids).order("created_at");
    const next = (data ?? []) as Group[];
    setGroups(next);
    setSelected(current => preferred ?? current ?? next[0]?.id ?? null);
  }

  useEffect(() => {
    async function load() {
      const s = createSupabaseBrowserClient();
      const { data: { user } } = await s.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { data: periodData } = await s.from("competition_periods")
        .select("id,competition,cadence,period_start,status")
        .in("competition", competitions)
        .in("status", ["open", "reconciling", "finalized"])
        .order("period_start", { ascending: false });
      const latest = new Map<string, Period>();
      for (const p of (periodData ?? []) as Period[]) {
        const key = `${p.competition}:${p.cadence}`;
        if (!latest.has(key)) latest.set(key, p);
      }
      setPeriods([...latest.values()]);
      const requestedGroup = new URLSearchParams(window.location.search).get("group") ?? undefined;
      await loadGroups(requestedGroup);
      setLoading(false);
    }
    void load();
  }, []);

  const activeGroup = groups.find(g => g.id === selected) ?? null;
  const memberCount = useMemo(() => members.filter(m => m.group_id === selected).length, [members, selected]);
  const period = periods.find(p => p.competition === competition && p.cadence === cadence) ?? null;
  const shareUrl = activeGroup ? `${PUBLIC_APP_ORIGIN}/groups/join/${activeGroup.join_code}` : "";
  const qrUrl = shareUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(shareUrl)}` : "";

  useEffect(() => {
    async function loadBoard() {
      if (!selected || !period) { setBoard([]); return; }
      const s = createSupabaseBrowserClient();
      const { data, error } = await s.rpc("athlete_group_leaderboard", { p_group_id: selected, p_period_id: period.id });
      if (error) { setMessage("PHATBOT couldn't load this group board."); setBoard([]); return; }
      setBoard((data ?? []) as Row[]);
    }
    void loadBoard();
  }, [selected, period?.id]);

  async function createGroup() {
    if (!newName.trim()) return;
    setMessage("");
    const s = createSupabaseBrowserClient();
    const { data, error } = await s.rpc("create_athlete_group", { p_name: newName.trim() });
    if (error) { setMessage(error.message); return; }
    setNewName("");
    await loadGroups(data as string);
    setMessage("Group created. Share the join code with your crew.");
  }

  async function shareGroup() {
    if (!activeGroup || !shareUrl) return;
    const shareData = {
      title: `Join ${activeGroup.name} on PHATBOT`,
      text: `Join my ${activeGroup.name} group on PHATBOT. Code: ${activeGroup.join_code}`,
      url: shareUrl,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); return; }
      catch (error) { if ((error as Error).name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Group invite link copied.");
    } catch {
      setMessage("PHATBOT couldn't open sharing. Use the join code or QR code instead.");
    }
  }

  async function copyInvite() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setMessage("Group invite link copied.");
  }

  async function joinGroup() {
    if (!joinCode.trim()) return;
    setMessage("");
    const s = createSupabaseBrowserClient();
    const { data, error } = await s.rpc("join_athlete_group", { p_join_code: joinCode.trim() });
    if (error) { setMessage(error.message); return; }
    setJoinCode("");
    await loadGroups(data as string);
    setMessage("You're in.");
  }

  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-4 py-8"><p className="text-zinc-500">Opening your groups...</p></main>;

  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6 sm:py-10">
    <header>
      <p className="text-xs font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT Groups</p>
      <h1 className="mt-2 text-4xl font-black">Your crew. Your arena.</h1>
      <p className="mt-2 text-zinc-400">Make PHATBOT smaller. Compete with your gym crew, family, friends, or any group you build.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">Create a group</p>
        <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={60} placeholder="5 AM Crew" className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm outline-none focus:border-[#ff0032]" />
        <button type="button" onClick={() => void createGroup()} className="mt-2 w-full rounded-xl bg-[#ff0032] px-4 py-3 text-sm font-black text-white">Create Group</button>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">Join a group</p>
        <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={8} placeholder="JOIN CODE" className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-3 py-3 text-sm font-black uppercase tracking-[.15em] outline-none focus:border-[#ff0032]" />
        <button type="button" onClick={() => void joinGroup()} className="mt-2 w-full rounded-xl border border-zinc-600 px-4 py-3 text-sm font-black">Join Group</button>
      </div>
    </section>

    {message && <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">{message}</p>}

    {groups.length === 0 ? <section className="rounded-3xl border border-dashed border-zinc-700 p-7 text-center"><p className="text-xl font-black">No groups yet.</p><p className="mt-2 text-sm text-zinc-500">Create your first crew or enter a code someone shared with you.</p></section> : <>
      <section>
        <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">My Groups</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {groups.map(g => <button key={g.id} type="button" onClick={() => setSelected(g.id)} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${selected === g.id ? "border-[#ff0032] bg-[#ff0032]/10" : "border-zinc-800 bg-zinc-950"}`}><p className="font-black">{g.name}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">{members.filter(m => m.group_id === g.id).length} member{members.filter(m => m.group_id === g.id).length === 1 ? "" : "s"}</p></button>)}
        </div>
      </section>

      {activeGroup && <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Group Arena</p><h2 className="mt-1 text-3xl font-black">{activeGroup.name}</h2><p className="mt-1 text-xs text-zinc-600">{memberCount} member{memberCount === 1 ? "" : "s"}</p></div>
          <button type="button" onClick={() => setShareOpen(true)} className="rounded-xl border border-[#ff0032]/40 bg-black px-3 py-2 text-center transition hover:border-[#ff0032]"><p className="text-[9px] font-black uppercase tracking-wide text-[#ff0032]">Share Group</p><p className="mt-1 font-black tracking-[.15em]">{activeGroup.join_code}</p></button>
        </div>

        {shareOpen && <div className="mt-5 rounded-2xl border border-[#ff0032]/30 bg-black p-5 text-center">
          <div className="flex items-start justify-between gap-4 text-left">
            <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff0032]">Invite your crew</p><p className="mt-1 text-sm text-zinc-400">Send the link or let someone scan the QR code. The join code still works too.</p></div>
            <button type="button" onClick={() => setShareOpen(false)} className="text-xl font-black text-zinc-500" aria-label="Close group sharing">×</button>
          </div>
          {qrUrl && <div className="mx-auto mt-5 flex w-fit items-center justify-center rounded-2xl bg-white p-4 shadow-xl"><img src={qrUrl} alt={`QR code to join ${activeGroup.name}`} className="block h-44 w-44 object-contain" /></div>}
          <p className="mt-4 text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Join code</p>
          <p className="mt-2 font-mono text-2xl font-black tracking-[.18em]">{activeGroup.join_code}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void shareGroup()} className="rounded-xl bg-[#ff0032] px-4 py-3 text-xs font-black text-white">SHARE INVITE</button>
            <button type="button" onClick={() => void copyInvite()} className="rounded-xl border border-zinc-700 px-4 py-3 text-xs font-black">COPY LINK</button>
          </div>
          <p className="mt-3 break-all text-[10px] text-zinc-600">{shareUrl}</p>
        </div>}

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 p-2">
          {(["daily","weekly"] as Cadence[]).map(c => <button key={c} type="button" onClick={() => setCadence(c)} className={`rounded-xl py-3 text-sm font-black capitalize ${cadence === c ? "bg-white text-black" : "text-zinc-500"}`}>{c === "daily" ? "Today" : "This Week"}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {competitions.map(c => <button key={c} type="button" onClick={() => setCompetition(c)} className={`rounded-xl border px-2 py-3 text-xs font-black ${competition === c ? "border-[#ff0032] bg-[#ff0032]/10 text-white" : "border-zinc-800 text-zinc-500"}`}>{labels[c]}</button>)}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
          {board.length === 0 ? <div className="p-5"><p className="font-black">No eligible results yet.</p><p className="mt-1 text-sm text-zinc-500">When a group member posts an eligible {labels[competition]} result, this board will come alive.</p></div>
          : board.map(row => <div key={row.athlete_user_id} className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-zinc-900 px-4 py-4 last:border-0 ${row.is_me ? "bg-[#ff0032]/8" : ""}`}><p className="text-center text-lg font-black">{row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}</p><div><p className={`font-black ${row.is_me ? "text-[#ff0032]" : ""}`}>{row.display_name}{row.is_me ? " · YOU" : ""}</p><p className="mt-1 text-xs text-zinc-600">{formatScore(competition, row)}</p></div><p className="text-sm font-black text-zinc-400">{formatScore(competition, row)}</p></div>)}
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-zinc-600">Group standings reuse PHATBOT's official scoring, but group wins are social-only. Official hardware is earned only on the overall PHATBOT leaderboard.</p>
      </section>}
    </>}

    <Link href="/compete" className="rounded-2xl border border-zinc-800 px-4 py-4 text-center text-sm font-black">← Back to PHATBOT Overall</Link>
  </main>;
}
