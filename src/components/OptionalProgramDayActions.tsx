"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { canSkipOptionalDay, optionalSkipParameters, type ProgramDayOption } from "@/features/programs/optionalDays";

export default function OptionalProgramDayActions({ option, disabled = false, onSkipped }: {
  option: ProgramDayOption;
  disabled?: boolean;
  onSkipped: () => void;
}) {
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: "start" | "skip") {
    if (busy.current || disabled || !option.is_optional) return;
    if (action === "skip" && !canSkipOptionalDay(option)) return;
    busy.current = true;
    setWorking(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (action === "skip") {
        const { data, error } = await supabase.rpc("skip_my_optional_program_day", optionalSkipParameters(option));
        if (error || typeof data !== "boolean") throw new Error("skip unavailable");
        // Includes a stale/replayed no-op. Always reload authoritative position.
        onSkipped();
      } else {
        const { data, error } = await supabase.rpc("start_my_optional_program_workout", {
          p_assignment_id: option.assignment_id,
          p_program_day_id: option.program_day_id,
        });
        if (error || typeof data !== "string") throw new Error("start unavailable");
        window.location.href = `/sessions/${data}`;
      }
    } catch {
      // A network error may follow a committed RPC: do not claim it rolled back
      // or automatically submit it again. Home can resume any started workout.
      setMessage("PHATBOT couldn't confirm that action. If a workout is in progress, finish or resume it from Home. Otherwise, refresh your program before trying again. Your saved training history is safe.");
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  if (!option.is_optional) return null;
  return <div className="mt-4">
    <p className="text-sm leading-6 text-zinc-300">Want the extra session? It&apos;s here if you do.</p>
    {!canSkipOptionalDay(option) && <p className="mt-1 text-xs text-zinc-400">This bonus session won&apos;t move your next normal workout.</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <button type="button" disabled={disabled || working} onClick={() => void act("start")} className="min-h-12 rounded-xl bg-[#ff0032] px-4 py-3 font-black text-white disabled:opacity-50">{working ? "Please wait..." : `Start Day ${option.day_number}`}</button>
      {canSkipOptionalDay(option) && <button type="button" disabled={disabled || working} onClick={() => void act("skip")} className="min-h-12 rounded-xl border border-zinc-600 px-4 py-3 font-black text-zinc-200 disabled:opacity-50">Skip to Day {option.following_day_number}</button>}
    </div>
    {message && <p role="alert" className="mt-3 text-sm text-amber-300">{message}</p>}
  </div>;
}
