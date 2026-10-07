// Disposable PostgreSQL test. Pass an installed @electric-sql/pglite module path.
// No network connection or production credentials are used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2] ?? "@electric-sql/pglite");
const db = new PGlite();
const prior = readFileSync("supabase/migrations/20261007010000_train_like_athlete.sql", "utf8");
const oldFunction = "create or replace function public.athlete_social_profile" + prior.split("create or replace function public.athlete_social_profile")[1];
const migration = readFileSync("supabase/migrations/20261007193001_platinum_weekly_award_art.sql", "utf8");
const owner = "00000000-0000-0000-0000-000000000001";
const viewer = "00000000-0000-0000-0000-000000000002";
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.profiles(id uuid primary key, display_name text, created_at timestamptz);
  create table public.athlete_profiles(user_id uuid primary key, leaderboard_identity_mode text, leaderboard_name text);
  create table public.workout_sessions(id uuid, athlete_user_id uuid, status text, is_test boolean, completed_at timestamptz, workout_name_snapshot text);
  create table public.workout_scores(workout_session_id uuid, athlete_user_id uuid, progression_count int, scored_exercise_count int);
  create table public.competition_periods(id int primary key, competition text, cadence text);
  create table public.competition_awards(id int primary key, period_id int, athlete_user_id uuid);
  insert into public.profiles values ('${owner}','Athlete','2026-09-01');
  insert into public.athlete_profiles values ('${owner}','private','Custom Athlete');
  insert into public.competition_periods values (1,'beast','daily'),(2,'beast','weekly'),(3,'step_king','weekly');
  insert into public.competition_awards values (1,1,'${owner}'),(2,1,'${owner}'),(3,2,'${owner}'),(4,2,'${owner}'),(5,2,'${owner}'),(6,3,'${owner}');
`);
await db.exec(oldFunction);
const read = async (uid, role = "authenticated") => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec(`set role ${role}`);
  try { return (await db.query("select * from public.athlete_social_profile($1)", [owner])).rows; }
  finally { await db.exec("reset role"); }
};
const oldOwner = (await read(owner))[0];
const history = (await db.query("select * from public.competition_awards order by id")).rows;
await db.exec(migration);
const updated = (await read(owner))[0];
const { award_counts_by_cadence: cadence, ...legacy } = updated;
assert.deepEqual(legacy, oldOwner, "All legacy fields including aggregates must remain identical");
assert.deepEqual(cadence, [
  { competition: "beast", cadence: "daily", count: 2 },
  { competition: "beast", cadence: "weekly", count: 3 },
  { competition: "step_king", cadence: "weekly", count: 1 },
]);
assert.deepEqual(updated.award_counts, { beast: 5, step_king: 1 });
assert.equal(cadence.reduce((n,a) => n + a.count, 0), history.length);
assert.deepEqual(await read(viewer), [], "Private athlete stays private");
assert.deepEqual(await read(""), [], "Missing identity returns no profile");
await assert.rejects(() => read(viewer, "anon"), /permission denied/);
for (const mode of ["profile", "custom"]) {
  await db.query("update public.athlete_profiles set leaderboard_identity_mode=$1", [mode]);
  const row = (await read(viewer))[0];
  assert.equal(row.display_name, mode === "profile" ? "Athlete" : "Custom Athlete");
  assert.deepEqual(row.award_counts_by_cadence, cadence);
}
assert.deepEqual((await db.query("select * from public.competition_awards order by id")).rows, history, "No historical record changes");
await db.exec("delete from public.competition_awards"); // Disposable fixture only.
const empty = (await read(owner))[0];
assert.deepEqual(empty.award_counts_by_cadence, []);
assert.deepEqual(empty.award_counts, {});
const meta = (await db.query("select prosecdef, provolatile, proconfig from pg_proc where oid='public.athlete_social_profile(uuid)'::regprocedure")).rows[0];
assert.equal(meta.prosecdef, true);
assert.equal(meta.provolatile, "s");
assert.ok(meta.proconfig.some(v => v.startsWith("search_path=")));
await db.close();
console.log("PASS: migration compiles; legacy output unchanged; mixed cadence counts correct; private/self/public/custom/anonymous access preserved; award rows unchanged; empty cabinet correct.");
