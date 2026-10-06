"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import TrainTogetherCompetitionBoard, { type TrainTogetherStanding } from "@/components/TrainTogetherCompetitionBoard";

type Room = { id: string; room_name: string; status: string };

export default function TrainTogetherReportCard({ sessionId }: { sessionId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [beast, setBeast] = useState<TrainTogetherStanding[]>([]);
  const [eager, setEager] = useState<TrainTogetherStanding[]>([]);
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

      const [roomResult, beastResult, eagerResult] = await Promise.all([
        (s as any).from("live_workout_rooms").select("id,room_name,status").eq("id", membership.room_id).maybeSingle(),
        (s as any).rpc("get_live_workout_room_standings", { p_room_id: membership.room_id, p_competition: "beast" }),
        (s as any).rpc("get_live_workout_room_standings", { p_room_id: membership.room_id, p_competition: "eager_beaver" }),
      ]);
      if (!active) return;
      setRoom((roomResult.data ?? null) as Room | null);
      setBeast((beastResult.data ?? []) as TrainTogetherStanding[]);
      setEager((eagerResult.data ?? []) as TrainTogetherStanding[]);
    }
    void load();
    return () => { active = false; };
  }, [sessionId]);

  if (!room) return null;
  const allRows = [...beast, ...eager];
  const complete = allRows.length > 0 && allRows.every((r) => r.session_status === "completed");
  const beastWinner = complete ? beast.find((r) => r.rank === 1 && r.score !== null) : null;
  const eagerWinner = complete ? eager.find((r) => r.rank === 1 && r.score !== null) : null;

  return (
    <section className="mx-auto mb-6 max-w-2xl px-4 sm:px-6">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
        <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT SOCIAL</p>
        <h2 className="mt-1 text-xl font-black">Train Together Results</h2>
        <p className="mt-1 text-sm text-zinc-500">{room.room_name}</p>

        {(beastWinner || eagerWinner) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {beastWinner && <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">ROOM BEAST</p>
              <p className="mt-1 text-2xl font-black">{beastWinner.athlete_user_id === me ? "YOU" : beastWinner.athlete_name}</p>
              <p className="mt-1 text-lg font-black text-amber-400">{beastWinner.result_label}</p>
            </div>}
            {eagerWinner && <div className="rounded-2xl border border-orange-300/30 bg-orange-300/5 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-300">ROOM EAGER BEAVER</p>
              <p className="mt-1 text-2xl font-black">{eagerWinner.athlete_user_id === me ? "YOU" : eagerWinner.athlete_name}</p>
              <p className="mt-1 text-lg font-black text-orange-300">{eagerWinner.result_label}</p>
            </div>}
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <TrainTogetherCompetitionBoard competition="beast" rows={beast} me={me} />
          <TrainTogetherCompetitionBoard competition="eager_beaver" rows={eager} me={me} />
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-zinc-500">
          {complete
            ? "Final room rankings. These social wins are separate from official PHATBOT awards and never add hardware to the Trophy Cabinet."
            : "One or more athletes are still training, so room results remain provisional."}
        </p>
      </div>
    </section>
  );
}
