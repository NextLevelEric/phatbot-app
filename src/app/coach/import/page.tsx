"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { parseTemplateRows, type TemplateWorkout } from "@/features/import/workoutTemplate";

type Athlete = { id: string; name: string };

export default function CoachWorkoutImportPage() {
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState("");
  const [fileName, setFileName] = useState("");
  const [workouts, setWorkouts] = useState<TemplateWorkout[]>([]);
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/auth"; return; }
      const { data: coach } = await supabase.from("coach_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!coach) { setMessage("Coach mode is required to import workout templates."); setLoading(false); return; }
      const { data: links, error } = await supabase.from("coach_athletes").select("athlete_user_id").eq("coach_user_id", user.id).eq("active", true);
      if (error) { setMessage(error.message); setLoading(false); return; }
      const rows: Athlete[] = [];
      for (const link of links ?? []) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", link.athlete_user_id).maybeSingle();
        rows.push({ id: link.athlete_user_id, name: profile?.display_name ?? "Athlete" });
      }
      rows.sort((a,b)=>a.name.localeCompare(b.name));
      setAthletes(rows);
      if (rows.length === 1) setAthleteId(rows[0].id);
      setLoading(false);
    }
    load();
  }, []);

  async function parseFile(file: File | null) {
    setWorkouts([]); setMessage(""); setFileName("");
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setMessage("Please choose an .xlsx workout spreadsheet."); return; }
    setParsing(true); setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const parsed: TemplateWorkout[] = [];
      for (const sheetName of book.SheetNames) {
        const sheet = book.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
        const workout = parseTemplateRows(sheetName, rows);
        if (workout) parsed.push(workout);
      }
      if (!parsed.length) setMessage("PHATBOT could not find any workout tabs with Exercise/Excercise and Target Reps headers. Nothing has been imported.");
      setWorkouts(parsed);
    } catch (error) {
      setMessage(error instanceof Error ? `Could not read spreadsheet: ${error.message}` : "Could not read spreadsheet. Nothing has been imported.");
    } finally { setParsing(false); }
  }

  const exerciseCount = workouts.reduce((n,w)=>n+w.exercises.length,0);
  const setCount = workouts.reduce((n,w)=>n+w.exercises.reduce((m,e)=>m+e.sets.length,0),0);
  const warningCount = workouts.reduce((n,w)=>n+w.warnings.length,0);
  const athlete = athletes.find(a=>a.id===athleteId);

  if (loading) return <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6"><p className="text-zinc-300">Beep boop... preparing template scanner.</p></main>;

  return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-sm font-semibold uppercase tracking-[.25em] text-zinc-400">PHATBOT Coach</p><h1 className="mt-2 text-3xl font-bold">Import Workout Template</h1><p className="mt-2 max-w-2xl text-zinc-400">Upload the spreadsheet you already use. PHATBOT will scan it first and show exactly what it understands before any workout is created.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/coach/import/history" className="whitespace-nowrap rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm font-semibold">Import History</Link><Link href="/coach" className="whitespace-nowrap rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm font-semibold">Back to Coach</Link></div>
    </header>

    <section className="rounded-2xl border border-zinc-800 p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-semibold">1. Choose athlete</span><select value={athleteId} onChange={e=>setAthleteId(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-3"><option value="">Select linked athlete</option>{athletes.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="block"><span className="text-sm font-semibold">2. Choose XLSX file</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>parseFile(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-lg border border-zinc-700 px-3 py-3 text-sm" /></label>
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">Preview only. Uploading a file does not modify the athlete's program. PHATBOT currently reads workout tabs containing Exercise/Excercise, Target Reps, and optional Notes columns.</p>
    </section>

    {message && <section className="rounded-xl border border-zinc-700 p-4 text-sm text-zinc-200">{message}</section>}
    {parsing && <p className="text-zinc-300">Beep boop... inspecting workbook structure.</p>}

    {workouts.length>0 && <>
      <section className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">File</p><p className="mt-1 break-words font-semibold">{fileName}</p></div><div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">Workouts</p><p className="mt-1 text-2xl font-black">{workouts.length}</p></div><div className="rounded-xl border border-zinc-800 p-4"><p className="text-xs text-zinc-500">Exercises / Sets</p><p className="mt-1 text-2xl font-black">{exerciseCount} / {setCount}</p></div><div className={`rounded-xl border p-4 ${warningCount?"border-zinc-500":"border-zinc-800"}`}><p className="text-xs text-zinc-500">Warnings</p><p className="mt-1 text-2xl font-black">{warningCount}</p></div></section>

      <section className="flex flex-col gap-4">{workouts.map(workout=><article key={workout.sheetName} className="rounded-2xl border border-zinc-800 p-5 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">{workout.sheetName}</p><h2 className="mt-1 text-xl font-bold">{workout.name}</h2></div><p className="text-sm text-zinc-500">{workout.exercises.length} exercises · {workout.exercises.reduce((n,e)=>n+e.sets.length,0)} sets</p></div>{workout.warnings.length>0&&<div className="mt-4 rounded-lg border border-zinc-700 p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Review before import</p>{workout.warnings.map((w,i)=><p key={i} className="mt-1 text-sm text-zinc-300">• {w}</p>)}</div>}<div className="mt-5 flex flex-col gap-3">{workout.exercises.map((exercise,index)=><div key={`${exercise.name}-${index}`} className="rounded-xl bg-zinc-950 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{index+1}. {exercise.name}</h3>{exercise.notes&&<p className="mt-1 text-sm text-zinc-400">{exercise.notes}</p>}</div><div className="flex flex-wrap gap-2">{exercise.sets.map((set,i)=><span key={i} className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold">Set {i+1}: {set.targetReps??"⚠ blank"}</span>)}</div></div></div>)}</div></article>)}</section>

      <section className="rounded-2xl border border-zinc-600 p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-400">Import checkpoint</p><h2 className="mt-2 text-xl font-bold">Ready to create these workouts for {athlete?.name??"the selected athlete"}?</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Not yet. This first interface intentionally stops at preview. Review the parsed structure above. The next implementation pass will add the explicit database commit only after we confirm this preview matches your real spreadsheet.</p><button disabled className="mt-4 w-full cursor-not-allowed rounded-lg bg-zinc-800 px-5 py-3 font-bold text-zinc-500 sm:w-auto">Import Workouts — Preview Mode</button></section>
    </>}
  </main>;
}
