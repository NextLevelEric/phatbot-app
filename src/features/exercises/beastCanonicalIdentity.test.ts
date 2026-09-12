import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateStrengthChange } from "../scoring/strengthChange";

const migration = readFileSync(
  "supabase/migrations/20260912183513_canonicalize_beast_exercise_comparisons.sql",
  "utf8",
).replace(/\r/g, "");

describe("Beast canonical exercise identity", () => {
  it("compares reviewed aliases without changing Beast volume math", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "canonical-db-bench", sets: [{ weight: 55, reps: 10, setType: "working" }] }],
      [{ exerciseId: "canonical-db-bench", sets: [{ weight: 50, reps: 10, setType: "working" }] }],
    );

    expect(result).toEqual({
      currentLiftTotal: 550,
      previousLiftTotal: 500,
      percentageChange: 10,
      comparableExerciseCount: 1,
    });
  });

  it("aggregates multiple recorded aliases that resolve to one canonical movement", () => {
    const result = calculateStrengthChange(
      [
        { exerciseId: "canonical-db-bench", sets: [{ weight: 55, reps: 5, setType: "working" }] },
        { exerciseId: "canonical-db-bench", sets: [{ weight: 55, reps: 5, setType: "working" }] },
      ],
      [
        { exerciseId: "canonical-db-bench", sets: [{ weight: 50, reps: 5, setType: "working" }] },
        { exerciseId: "canonical-db-bench", sets: [{ weight: 50, reps: 5, setType: "working" }] },
      ],
    );

    expect(result.currentLiftTotal).toBe(550);
    expect(result.previousLiftTotal).toBe(500);
    expect(result.percentageChange).toBe(10);
    expect(result.comparableExerciseCount).toBe(1);
  });

  it("does not compare distinct movement variations", () => {
    const result = calculateStrengthChange(
      [{ exerciseId: "flat-db-bench", sets: [{ weight: 55, reps: 10, setType: "working" }] }],
      [{ exerciseId: "incline-db-bench", sets: [{ weight: 50, reps: 10, setType: "working" }] }],
    );

    expect(result.percentageChange).toBeNull();
    expect(result.comparableExerciseCount).toBe(0);
  });

  it("keeps both SQL contracts and the skipped-exercise/finalization guards", () => {
    expect(migration).toContain("function public.phatbot_rebuild_competition_period(p_period_id uuid)");
    expect(migration).toContain("returns void\nlanguage plpgsql\nsecurity definer\nset search_path to 'public'");
    expect(migration).toContain("function public.get_live_workout_room_beast(p_room_id uuid)");
    expect(migration).toContain("returns table (athlete_user_id uuid,athlete_name text,workout_session_id uuid,session_status text,score numeric,result_label text,comparable_exercises integer,rank bigint)");
    expect(migration).toContain("language sql stable security definer set search_path=public");
    expect(migration).toContain("Finalized competition periods are immutable");
    expect(migration.match(/current_eligible_set_count>0 and previous_total>0/g)).toHaveLength(4);
    expect(migration).not.toMatch(/perform\s+public\.phatbot_rebuild_competition_period/i);
    expect(migration).not.toContain("function public.phatbot_competition_lifecycle");
  });

  it("groups current and prior volume by canonical identity in official and live Beast", () => {
    expect(migration).toContain("coalesce(cur_identity.canonical_exercise_id,cur.exercise_id) canonical_exercise_id");
    expect(migration).toContain("coalesce(prev_identity.canonical_exercise_id,prev_ex.exercise_id)=coalesce(cur_identity.canonical_exercise_id,cur.exercise_id)");
    expect(migration).toContain("coalesce(pex_identity.canonical_exercise_id,pex.exercise_id)=c.canonical_exercise_id");
  });

  it("preserves the existing restricted grants", () => {
    expect(migration).toContain("revoke all on function public.phatbot_rebuild_competition_period(uuid) from public,anon,authenticated;");
    expect(migration).toContain("grant execute on function public.phatbot_rebuild_competition_period(uuid) to service_role;");
    expect(migration).toContain("revoke all on function public.get_live_workout_room_beast(uuid) from public,anon,authenticated;");
    expect(migration).toContain("grant execute on function public.get_live_workout_room_beast(uuid) to authenticated,service_role;");
  });
});
