import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const forwardPath = "supabase/migrations/20260911180023_fix_beast_skipped_exercise_scoring.sql";
const rollbackPath = "supabase/rollbacks/20260911180023_fix_beast_skipped_exercise_scoring.rollback.sql";

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r/g, "");
}

describe("Beast skipped-exercise migration contract", () => {
  const forward = read(forwardPath);

  it("preserves function signatures, security modes, search paths, and callers", () => {
    expect(forward).toContain("function public.phatbot_rebuild_competition_period(p_period_id uuid)");
    expect(forward).toContain("returns void\nlanguage plpgsql\nsecurity definer\nset search_path to 'public'");
    expect(forward).toContain("function public.get_live_workout_room_beast(p_room_id uuid)");
    expect(forward).toContain("returns table (athlete_user_id uuid,athlete_name text,workout_session_id uuid,session_status text,score numeric,result_label text,comparable_exercises integer,rank bigint)");
    expect(forward).toContain("language sql stable security definer set search_path=public");
  });

  it("keeps privileged execution restricted to existing caller roles", () => {
    expect(forward).toContain("revoke all on function public.phatbot_rebuild_competition_period(uuid) from public,anon,authenticated;");
    expect(forward).toContain("grant execute on function public.phatbot_rebuild_competition_period(uuid) to service_role;");
    expect(forward).toContain("revoke all on function public.get_live_workout_room_beast(uuid) from public,anon,authenticated;");
    expect(forward).toContain("grant execute on function public.get_live_workout_room_beast(uuid) to authenticated,service_role;");
  });

  it("requires eligible current work in official and live scoring", () => {
    expect(forward.match(/current_eligible_set_count>0 and previous_total>0/g)).toHaveLength(4);
    expect(forward).toContain("if v_period.status='finalized' then raise exception 'Finalized competition periods are immutable'; end if;");
  });

  it("does not invoke a rebuild or replace competition lifecycle timing", () => {
    expect(forward).not.toMatch(/perform\s+public\.phatbot_rebuild_competition_period/i);
    expect(forward).not.toContain("function public.phatbot_competition_lifecycle");
    expect(forward).not.toMatch(/update\s+public\.competition_periods/i);
  });

  it("contains exact rollback definitions from the immediately preceding migrations", () => {
    const rollback = read(rollbackPath);
    const priorRebuildFile = read("supabase/migrations/20260908_230_cardio_bunny_segment_scoring_v4.sql");
    const priorRebuild = priorRebuildFile
      .slice(priorRebuildFile.indexOf("create or replace function"), priorRebuildFile.indexOf("update public.competition_periods"))
      .trim();
    const rollbackRebuild = rollback
      .slice(
        rollback.indexOf("create or replace function public.phatbot_rebuild_competition_period"),
        rollback.indexOf("grant execute on function public.phatbot_rebuild_competition_period"),
      )
      .trim();

    const priorLiveFile = read("supabase/migrations/20260904_190_live_workout_room_beast.sql");
    const priorLive = priorLiveFile
      .slice(0, priorLiveFile.indexOf("revoke all on function public.get_live_workout_room_beast"))
      .trim();
    const rollbackLive = rollback
      .slice(
        rollback.indexOf("-- Train Together room-only Beast standings."),
        rollback.indexOf("revoke all on function public.get_live_workout_room_beast"),
      )
      .trim();

    expect(rollbackRebuild).toBe(priorRebuild);
    expect(rollbackLive).toBe(priorLive);
  });
});
