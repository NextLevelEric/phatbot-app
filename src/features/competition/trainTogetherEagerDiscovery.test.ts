import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync("supabase/migrations/20261007174000_train_together_eager_compete_discovery.sql","utf8");
const home=readFileSync("src/app/page.tsx","utf8");
const discovery=readFileSync("src/components/CompeteDiscoveryCard.tsx","utf8");
const board=readFileSync("src/components/TrainTogetherCompetitionBoard.tsx","utf8");

describe("Train Together Eager live scoring",()=>{
  it("uses exercise-level PO results instead of waiting on workout score persistence",()=>{
    expect(migration).toContain("public.exercise_scores");
    expect(migration).toContain("xs.result in ('progression','neutral','regression')");
    expect(migration).toContain("Eager so far");
    expect(migration).not.toContain("left join public.workout_scores");
  });
  it("keeps cancelled athletes from blocking completed results",()=>{
    expect(migration).toContain("when session_status='cancelled' then 'Workout ended'");
    expect(board).toContain('row.session_status === "cancelled"');
  });
});

describe("Compete discovery",()=>{
  it("only prompts eligible private athletes who have not made a choice",()=>{
    expect(discovery).toContain('leaderboard_identity_mode==="private"');
    expect(discovery).toContain("leaderboard_identity_decided_at");
    expect(discovery).toContain("(count??0)>0");
    expect(home).toContain("CompeteDiscoveryCard");
  });
  it("offers profile, custom, and explicit private choices",()=>{
    expect(discovery).toContain("Use my profile name");
    expect(discovery).toContain("Choose a competition name");
    expect(discovery).toContain("Stay private");
    expect(discovery).toContain("We won’t keep asking");
  });
});
