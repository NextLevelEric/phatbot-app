"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Room = { id: string; room_name: string; status: string };
type BeastRow = {
  athlete_user_id: string;
  athlete_name: string;
  workout_session_id: string | null;
  session_status: string | null;
  score: number | null;
  result_label: string;
  comparable_exercises: number;
  rank: number | null;
};

export default function TrainTogetherReportCard({ sessionId }: { sessionId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [rows, setRows] = useState<BeastRow[]>([]);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const s = createSupabaseBrowserClient();
      const { data: { user } } = await s.auth.getUser();
      if (!user || !active) return;
      setMe(user.id);

      const { data: membership } = await (s as any)
        .from("live_workout_room_members")
        .select("room_id")
        .eq("athlete_user_id", user.id)
        .eq("workout_session_id", sessionId)
        .maybeSingle();
      if (!membership?.room_id) return;

      const [{ data: roomData }, { data: beastData }] = await Promise.all([
        (s as any).from("live_workout_rooms").select("id,room_name,status").eq("id", membership.room_id).maybeSingle(),
        (s as any).rpc("get_live_workout_room_beast", { p_room_id: membership.room_id }),
      ]);
      if (!active) return;
      setRoom((roomData ?? null) as Room | null);
      setRows((beastData ?? []) as BeastRow[]);
    }
    void load();
    return () => { active = false; };
  }, [sessionId]);

  if (!room) return null;
  const complete = rows.length > 0 && rows.every((r) => r.session_status === "completed");
  const winner = complete ? rows.find((r) => r.rank === 1 && r.score !== null) : null;

  return (
    <section className="mx-auto mb-6 max-w-2xl px-4 sm:px-6">
      <div className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-5">
        <p className="text-[10px] font-black uppercase tracking-[.22em] text-amber-400">PHATBOT SOCIAL</p>
        <h2 className="mt-1 text-xl font-black">Train Together Results</h2>
        <p className="mt-1 text-sm text-zinc-500">{room.room_name}</p>

        {winner && (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-black/20 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">ROOM BEAST</p>
            <p className="mt-1 text-2xl font-black">{winner.athlete_user_id === me ? "YOU" : winner.athlete_name}</p>
            <p className="mt-1 text-lg font-black text-amber-400">{winner.result_label}</p>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {rows.map((r) => {
            const hasScore = r.score !== null && r.comparable_exercises > 0;
            return (
              <div key={r.athlete_user_id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${r.athlete_user_id === me ? "border-[#ff0032]/40 bg-[#ff0032]/5" : "border-zinc-800 bg-black/10"}`}>
                <div className="w-8 text-center text-sm font-black">{hasScore && r.rank ? `#${r.rank}` : "—"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{r.athlete_user_id === me ? "YOU" : r.athlete_name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {r.comparable_exercises > 0 ? `${r.comparable_exercises} comparable lift${r.comparable_exercises === 1 ? "" : "s"}` : "baseline workout"}
                  </p>
                </div>
                <div className={`text-sm font-black ${hasScore ? "text-amber-400" : "text-zinc-500"}`}>{hasScore ? r.result_label : "Baseline"}</div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
          {complete ? "Final room ranking. This social result is separate from the official Daily Beast leaderboard." : "One or more athletes are still training, so these room results are provisional."}
        </p>
      </div>
    </section>
  );
}
