"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  bodyweightInputLimits,
  formatBodyweight,
  validateBodyweightInput,
  type BodyweightMeasurement,
  type BodyweightUnit,
} from "@/features/bodyweight/bodyweight";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type LatestMeasurement = Pick<BodyweightMeasurement, "id" | "weight_value" | "unit" | "measured_at" | "created_at">;

export default function BodyweightQuickLog() {
  const [userId, setUserId] = useState<string | null>(null);
  const [unit, setUnit] = useState<BodyweightUnit>("lb");
  const [latest, setLatest] = useState<LatestMeasurement | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        const [profileResult, weightResult] = await Promise.all([
          supabase.from("athlete_profiles").select("preferred_unit").eq("user_id", user.id).maybeSingle(),
          supabase.from("bodyweight_measurements").select("id,weight_value,unit,measured_at,created_at").eq("athlete_user_id", user.id).order("measured_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (!active) return;
        setUserId(user.id);
        setUnit(profileResult.data?.preferred_unit === "kg" ? "kg" : "lb");
        if (weightResult.error) setUnavailable(true);
        else setLatest(weightResult.data as LatestMeasurement | null);
      } catch {
        if (active) setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const validation = validateBodyweightInput(value, unit);
    if (!validation.valid) {
      setMessage(validation.message);
      return;
    }
    if (!userId) {
      setMessage("PHATBOT could not verify your account. Please refresh and try again.");
      return;
    }

    setSaving(true);
    try {
      const measuredAt = new Date().toISOString();
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.from("bodyweight_measurements").insert({
        athlete_user_id: userId,
        weight_value: validation.value,
        unit,
        measured_at: measuredAt,
        source: "manual",
      }).select("id,weight_value,unit,measured_at,created_at").single();
      if (error || !data) {
        setMessage("PHATBOT could not save that weight. No measurement was added. Please try again.");
        return;
      }
      setLatest(data as LatestMeasurement);
      setValue("");
      setEntryOpen(false);
      setMessage(`Saved ${formatBodyweight(Number(data.weight_value), data.unit as BodyweightUnit)}.`);
    } catch {
      setMessage("PHATBOT could not save that weight. No measurement was added. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const limits = bodyweightInputLimits(unit);

  return <section aria-labelledby="bodyweight-quick-log" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Body weight</p>
        <h2 id="bodyweight-quick-log" className="mt-1 text-lg font-black">
          {loading ? "Checking latest weight…" : latest ? `Latest: ${formatBodyweight(Number(latest.weight_value), latest.unit)}` : "No weight logged yet"}
        </h2>
      </div>
      {!unavailable && <button type="button" onClick={() => { setEntryOpen(open => !open); setMessage(""); }} disabled={loading} className="shrink-0 rounded-xl border border-[#ff0032]/60 px-4 py-2.5 text-sm font-black text-[#ff0032] disabled:opacity-50">{entryOpen ? "Cancel" : "Log weight"}</button>}
    </div>

    {unavailable ? <p className="mt-3 text-sm text-zinc-500">Weight logging is temporarily unavailable. Your existing training data is safe.</p> : entryOpen && <form onSubmit={save} className="mt-4 flex items-end gap-3 border-t border-zinc-800 pt-4">
      <label className="min-w-0 flex-1 text-xs font-bold text-zinc-400">
        Current weight
        <div className="mt-2 flex items-center rounded-xl border border-zinc-700 bg-black focus-within:border-[#ff0032]">
          <input autoFocus required type="number" inputMode="decimal" min={limits.min} max={limits.max} step="0.01" value={value} onChange={event => setValue(event.target.value)} placeholder={unit === "lb" ? "222.4" : "82.5"} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-black outline-none" />
          <span className="pr-4 text-sm font-black text-zinc-500">{unit}</span>
        </div>
      </label>
      <button disabled={saving} className="rounded-xl bg-[#ff0032] px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
    </form>}

    <div className="mt-3 flex min-h-5 items-center justify-between gap-3">
      <p aria-live="polite" className={`text-xs ${message.startsWith("Saved") ? "text-emerald-400" : "text-zinc-500"}`}>{message}</p>
      {!unavailable && <Link href="/progress/weight" className="shrink-0 text-xs font-bold text-zinc-500 underline">History</Link>}
    </div>
  </section>;
}
