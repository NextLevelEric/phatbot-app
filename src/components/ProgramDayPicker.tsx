"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Day = { id: string; day_number: number; name: string };

export default function ProgramDayPicker({
  assignmentId, nextDayId, cursorRevision, days,
}: {
  assignmentId: string;
  nextDayId: string;
  cursorRevision: number;
  days: Day[];
}) {
  const [selected, setSelected] = useState("");
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const next = days.find((day) => day.id === nextDayId);
  const chosen = days.find((day) => day.id === selected);

  async function startSelected() {
    if (!chosen || starting) return;
    setStarting(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("start_my_selected_program_workout", {
      p_assignment_id: assignmentId,
      p_program_day_id: chosen.id,
      p_cursor_revision: cursorRevision,
    });
    if (!error && typeof data === "string") {
      window.location.href = `/sessions/${data}`;
      return;
    }
    // An uncertain network response may follow a committed start. Never retry
    // automatically; the home screen resumes any authoritative active session.
    setMessage("We couldn't confirm the start. Check Home for an in-progress workout, or refresh this page before trying again. Your coach's program is safe.");
    setStarting(false);
  }

  return <section className="rounded-2xl border border-zinc-800 p-5" id="choose-program-day">
    <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-500">Need to train a different day?</p>
    <h2 className="mt-2 text-xl font-black">Choose today&apos;s workout</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">{next?.name ?? "Your next workout"} remains the recommended choice. Choose another prescribed day when your schedule changes. A day still due moves to today; a day already passed starts a fresh rotation from there.</p>
    <label htmlFor="program-day-choice" className="mt-4 block text-sm font-bold">Workout day</label>
    <select id="program-day-choice" value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white">
      <option value="">Select a different workout</option>
      {days.filter((day) => day.id !== nextDayId).map((day) => <option key={day.id} value={day.id}>Day {day.day_number} · {day.name}</option>)}
    </select>
    <button type="button" disabled={!chosen || starting} onClick={() => void startSelected()} className="mt-4 min-h-12 w-full rounded-xl bg-[#ff0032] px-4 py-3 font-black text-white disabled:opacity-50">{starting ? "Starting..." : chosen ? `Start ${chosen.name} today` : "Choose a workout first"}</button>
    {message && <p role="alert" className="mt-3 text-sm text-amber-300">{message}</p>}
  </section>;
}
