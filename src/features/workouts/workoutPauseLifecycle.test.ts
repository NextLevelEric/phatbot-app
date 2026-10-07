import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20261007193000_workout_pause_stale_lifecycle.sql","utf8");
const workout=readFileSync("src/app/sessions/[id]/page.tsx","utf8");
const home=readFileSync("src/app/page.tsx","utf8");
const tools=readFileSync("src/components/LiveWorkoutMenu.tsx","utf8");

describe("workout pause lifecycle",()=>{
  it("pauses stale active workouts before abandoning them",()=>{
    expect(migration).toContain("interval '90 minutes'");
    expect(migration).toContain("pause_reason='inactive'");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("status='cancelled'");
  });
  it("supports explicit pause resume finish and end",()=>{
    expect(workout).toContain("pauseWorkout");
    expect(workout).toContain("resumeWorkout");
    expect(workout).toContain("Pause Workout");
    expect(workout).toContain("End Workout");
    expect(workout).toContain('status:"completed"');
  });
  it("does not count paused wall time as workout time",()=>{
    expect(migration).toContain("total_paused_seconds");
    expect(tools).toContain("total_paused_seconds");
    expect(tools).toContain("Paused · workout clock stopped");
  });
  it("reconciles stale sessions on Home and explains automatic pause",()=>{
    expect(home).toContain("reconcile_my_stale_workouts");
    expect(home).toContain("paused this workout after 90 minutes");
  });
  it("removes paused athletes from live Train Together standings",()=>{
    expect(migration).toContain("active_ws.paused_at is null");
    expect(migration).toContain("ws.paused_at is null");
  });
});
