"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Room = { id: string; room_name: string; join_code: string; status: string };
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

const PUBLIC_APP_ORIGIN = "https://app.phatbotfit.com";

export default function TrainTogetherCard({
  sessionId,
  workoutId,
  workoutName,
}: {
  sessionId: string;
  workoutId: string | null;
  workoutName: string;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [memberCount, setMemberCount] = useState(1);
  const [beast, setBeast] = useState<BeastRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  async function refresh(r: Room) {
    const s = createSupabaseBrowserClient();
    const [{ count }, { data }] = await Promise.all([
      (s as any)
        .from("live_workout_room_members")
        .select("id", { count: "exact", head: true })
        .eq("room_id", r.id),
      (s as any).rpc("get_live_workout_room_beast", { p_room_id: r.id }),
    ]);
    setMemberCount(count ?? 1);
    setBeast((data ?? []) as BeastRow[]);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      const s = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await s.auth.getUser();
      if (!user || !active) return;
      setMe(user.id);

      const { data: hostRoom } = await (s as any)
        .from("live_workout_rooms")
        .select("id,room_name,join_code,status")
        .eq("host_session_id", sessionId)
        .eq("host_user_id", user.id)
        .eq("status", "open")
        .maybeSingle();

      let foundRoom = hostRoom as Room | null;
      let host = Boolean(hostRoom);

      if (!foundRoom) {
        const { data: membership } = await (s as any)
          .from("live_workout_room_members")
          .select("room_id")
          .eq("athlete_user_id", user.id)
          .eq("workout_session_id", sessionId)
          .maybeSingle();

        if (membership?.room_id) {
          const { data: memberRoom } = await (s as any)
            .from("live_workout_rooms")
            .select("id,room_name,join_code,status")
            .eq("id", membership.room_id)
            .maybeSingle();
          foundRoom = memberRoom as Room | null;
        }
      }

      if (active && foundRoom) {
        setRoom(foundRoom);
        setIsHost(host);
        await refresh(foundRoom);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!room) return;
    const timer = setInterval(() => void refresh(room), 4000);
    return () => clearInterval(timer);
  }, [room?.id]);

  async function create() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const s = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await s.auth.getUser();
      if (!user) return;
      setMe(user.id);
      const roomName = name.trim() || `${workoutName} Crew`;
      const { data, error } = await (s as any)
        .from("live_workout_rooms")
        .insert({
          host_user_id: user.id,
          host_session_id: sessionId,
          workout_id: workoutId,
          room_name: roomName,
        })
        .select("id,room_name,join_code,status")
        .single();
      if (error) throw error;
      const { error: memberError } = await (s as any)
        .from("live_workout_room_members")
        .insert({ room_id: data.id, athlete_user_id: user.id, workout_session_id: sessionId });
      if (memberError) throw memberError;
      setRoom(data);
      setIsHost(true);
      setMemberCount(1);
      setOpen(false);
      await refresh(data);
    } catch (e) {
      setMessage((e as Error).message || "PHATBOT could not open the room.");
    } finally {
      setBusy(false);
    }
  }

  const joinUrl = room ? `${PUBLIC_APP_ORIGIN}/train-together/${room.join_code}` : "";
  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(joinUrl)}`
    : "";

  async function copy() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setMessage("Invite link copied.");
  }

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-4">
      <div className="flex items-center justify-between gap-4 pr-10">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#ff0032]">PHATBOT SOCIAL</p>
          <h2 className="mt-1 text-lg font-black">Train Together</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {room ? `${room.room_name} is live.` : "Invite the humans around you into this workout."}
          </p>
        </div>
        {!room && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-xl bg-[#ff0032] px-4 py-2 text-xs font-black text-white">
            CREATE ROOM
          </button>
        )}
      </div>

      {open && !room && (
        <div className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={`${workoutName} Crew`} className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black/20 px-3 py-2 text-sm" />
          <button disabled={busy} onClick={() => void create()} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-black">
            {busy ? "OPENING…" : "OPEN"}
          </button>
        </div>
      )}

      {room && (
        <>
          {isHost && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-700/60 p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <p className="text-xs font-black uppercase tracking-[.16em] text-zinc-500">
                  {room.room_name} · {memberCount} {memberCount === 1 ? "human" : "humans"}
                </p>
              </div>
              {qrUrl && (
                <div className="mx-auto mt-4 flex w-fit items-center justify-center rounded-2xl bg-white p-4 shadow-xl">
                  <img src={qrUrl} alt={`QR code to join ${room.room_name}`} className="block h-44 w-44 object-contain" />
                </div>
              )}
              <p className="mt-4 text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Scan to join</p>
              <p className="mt-2 font-mono text-2xl font-black tracking-[.18em]">{room.join_code}</p>
              <p className="mt-2 text-xs text-zinc-500">Each athlete gets their own copy of this live workout and keeps their own history.</p>
              <button onClick={() => void copy()} className="mt-3 rounded-xl border border-[#ff0032]/40 px-4 py-2 text-xs font-black text-[#ff0032]">
                COPY INVITE LINK
              </button>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-400">LIVE BEAST RACE</p>
                <h3 className="mt-1 text-base font-black">Who is beating themselves hardest?</h3>
              </div>
              <span className="text-[10px] font-bold uppercase text-zinc-500">refreshes live</span>
            </div>

            <div className="mt-3 space-y-2">
              {beast.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-500">Log some working sets. PHATBOT is waiting for evidence.</p>
              ) : (
                beast.map((r) => {
                  const hasScore = r.score !== null && r.comparable_exercises > 0;
                  return (
                    <div key={r.athlete_user_id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${r.athlete_user_id === me ? "border-[#ff0032]/40 bg-[#ff0032]/5" : "border-zinc-800/80 bg-black/10"}`}>
                      <div className="w-7 text-center text-sm font-black">{hasScore && r.rank ? `#${r.rank}` : "—"}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{r.athlete_user_id === me ? "YOU" : r.athlete_name}</p>
                        <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                          {r.comparable_exercises > 0 ? `${r.comparable_exercises} comparable lift${r.comparable_exercises === 1 ? "" : "s"}` : "building baseline"}
                          {r.session_status === "completed" ? " · finished" : " · training"}
                        </p>
                      </div>
                      <div className={`text-right text-sm font-black ${hasScore ? "text-amber-400" : "text-zinc-500"}`}>
                        {hasScore ? r.result_label : "BUILDING SCORE"}
                        {hasScore && r.session_status !== "completed" && <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-600">provisional</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
              Rankings update as sets are logged. Live numbers are provisional until everyone finishes. Room Beast never changes the official Daily Beast.
            </p>
          </div>
        </>
      )}

      {message && <p className="mt-3 text-xs text-zinc-500">{message}</p>}
    </section>
  );
}
