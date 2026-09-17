import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260917121148_sunday_weekly_progress_reports.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();
const weeklyPage = readFileSync("src/app/weekly/page.tsx", "utf8").toLowerCase();

describe("weekly progress report database contract", () => {
  it("stores versioned immutable Sunday snapshots with exact UTC bounds", () => {
    expect(normalized).toContain("create table public.weekly_progress_reports");
    expect(normalized).toContain("period_start timestamptz not null");
    expect(normalized).toContain("period_end timestamptz not null");
    expect(normalized).toContain("calculation_version text not null");
    expect(normalized).toContain("report_payload jsonb not null");
    expect(normalized).toContain("unique (athlete_user_id, period_start, period_end)");
    expect(normalized).toContain("finalized weekly progress reports are immutable");
    expect(normalized).not.toContain("update public.weekly_progress_reports");
  });

  it("keeps snapshots athlete-private and removes all client mutation grants", () => {
    expect(normalized).toContain("alter table public.weekly_progress_reports enable row level security");
    expect(normalized).toContain("revoke all on table public.weekly_progress_reports from public, anon, authenticated");
    expect(normalized).toContain("grant select on table public.weekly_progress_reports to authenticated");
    expect(normalized).toContain("(select auth.uid()) = athlete_user_id");
    expect(normalized).not.toContain("can_access_athlete");
  });

  it("uses persisted PO authority and explicitly detects incomplete coverage", () => {
    expect(normalized).toContain("public.exercise_scores");
    expect(normalized).toContain("public.workout_scores");
    expect(normalized).toContain("v_required_exercise_scores <> v_persisted_exercise_scores");
    expect(normalized).toContain("v_required_workout_scores <> v_persisted_workout_scores");
    expect(normalized).toContain("v_po_status := 'incomplete'");
    expect(normalized).not.toContain("scoreexerciseperformance");
  });

  it("uses the authoritative workload formula without changing source data", () => {
    expect(normalized).toContain("sum(s.weight * s.reps)");
    expect(normalized).toContain("s.set_type::text not in ('warmup', 'timed')");
    expect(normalized).not.toContain("update public.workout_sessions");
    expect(normalized).not.toContain("update public.exercise_scores");
    expect(normalized).not.toContain("update public.workout_scores");
  });

  it("requires Sunday Eastern midnight and waits until Sunday 12:30 Eastern", () => {
    expect(normalized).toContain("extract(dow from v_local_start)::integer <> 0");
    expect(normalized).toContain("interval '12 hours 30 minutes'");
    expect(normalized).toContain("weekly report is not ready to finalize");
    expect(normalized).toContain("date '2026-09-13'");
  });

  it("is idempotent and retains competition awards as separately sourced finalized hardware", () => {
    expect(normalized).toContain("on conflict (athlete_user_id, period_start, period_end) do nothing");
    expect(normalized).toContain("join public.competition_periods period");
    expect(normalized).toContain("period.status = 'finalized'");
    expect(normalized).not.toContain("phatbot_finalize_competition_period");
  });

  it("stops the weekly page from writing legacy weekly_scores", () => {
    expect(weeklyPage).not.toContain("weekly_scores");
    expect(weeklyPage).not.toContain(".upsert(");
    expect(weeklyPage).toContain("weekly_progress_reports");
  });
});
