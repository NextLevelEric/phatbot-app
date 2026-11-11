// Usage: node scripts/test-train-together-eager.mjs
// Local-only PostgreSQL fixture; never connects to Supabase or reads credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12,'0');
const room=id(100), other=id(101);
const fixed=readFileSync('supabase/migrations/20261008080000_fix_train_together_eager_ambiguous_columns.sql','utf8');
const previous=readFileSync('supabase/migrations/20261007193000_workout_pause_stale_lifecycle.sql','utf8');
const old=previous.match(/create or replace function public\.get_live_workout_room_standings[\s\S]*?\$function\$;/i)[0];
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create type public.competition_kind as enum ('beast','eager_beaver','step_king');
create table live_workout_rooms(id uuid primary key,host_user_id uuid);
create table live_workout_room_members(room_id uuid,athlete_user_id uuid,workout_session_id uuid);
create table workout_sessions(id uuid primary key,status text,paused_at timestamptz);
create table profiles(id uuid primary key,display_name text);
create table exercise_sessions(id uuid primary key,workout_session_id uuid);
create table exercise_scores(id uuid primary key,exercise_session_id uuid,athlete_user_id uuid,result text);
`);
await db.query('insert into live_workout_rooms values ($1,$2),($3,$4)',[room,id(1),other,id(9)]);
for (const [n,status,paused,results] of [
 [1,'in_progress',null,['progression','progression','progression','progression']],
 [2,'completed',null,['progression','progression','progression','neutral']],
 [3,'in_progress','2026-01-01',['progression']],
 [4,'in_progress',null,[]],
 [5,'completed',null,['regression','neutral','baseline']],
 [6,'completed',null,['progression','progression','progression','progression']],
 [9,'completed',null,['progression']],
]) {
 await db.query('insert into profiles values ($1,$2)',[id(n),'Athlete '+n]);
 await db.query('insert into workout_sessions values ($1,$2,$3)',[id(n+200),status,paused]);
 await db.query('insert into live_workout_room_members values ($1,$2,$3)',[n===9?other:room,id(n),id(n+200)]);
 for(let j=0;j<results.length;j++) {
  const ex=id(1000+n*10+j);
  await db.query('insert into exercise_sessions values ($1,$2)',[ex,id(n+200)]);
  await db.query('insert into exercise_scores values ($1,$2,$3,$4)',[ex,ex,id(n),results[j]]);
 }
}
// Cross-athlete scores must not leak into a member's rollup.
await db.query('insert into exercise_scores values ($1,$2,$3,$4)',[id(9999),id(1010),id(9),'regression']);
const caller=async n => db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
const standings=()=>db.query("select * from get_live_workout_room_standings($1,'eager_beaver')",[room]);
try {
 const body = sql => sql.split('$function$')[1].replace('#variable_conflict use_column','').replace(/\s/g,'');
 assert.equal(body(old),body(fixed),'Only ambiguity resolution may change; preserve Beast and Eager logic');
 await db.exec(old);
 await caller(1);
 await assert.rejects(standings,/column reference .* is ambiguous/);
 await db.exec('revoke all on function get_live_workout_room_standings(uuid,competition_kind) from public,anon; grant execute on function get_live_workout_room_standings(uuid,competition_kind) to authenticated,service_role;');
 await db.exec(fixed);
 const {rows}=await standings();
 assert.equal(rows.length,5); // paused and other-room athletes excluded
 const by=n=>rows.find(r=>r.athlete_user_id===id(n));
 assert.equal(Number(by(1).score),75); assert.equal(by(1).result_label,'75.0 Eager so far');
 assert.equal(Number(by(2).score),68.75); assert.equal(by(2).result_label,'68.8 Eager');
 assert.equal(by(3),undefined); assert.equal(by(9),undefined);
 assert.equal(by(4).score,null); assert.equal(by(4).rank,null); assert.equal(by(4).evidence_count,0);
 assert.equal(by(4).result_label,'Log a comparable exercise');
 assert.equal(Number(by(5).score),41.67); assert.equal(by(5).evidence_count,2);
 assert.equal(Number(by(6).rank),1); assert.equal(Number(by(1).rank),1); assert.equal(Number(by(2).rank),3);
 await db.query('update workout_sessions set paused_at=null where id=$1',[id(203)]);
 assert.equal((await standings()).rows.length,6);
 await db.exec('grant usage on schema public to authenticated; set role authenticated');
 await caller(2); assert.equal((await standings()).rows.length,6);
 await caller(9); await assert.rejects(standings,/Not authorized/);
 await caller(null); await assert.rejects(standings,/Authentication required/);
 await caller(1);
 await assert.rejects(()=>db.query("select * from get_live_workout_room_standings($1,'step_king')",[room]),/currently supports/);
 await db.exec('reset role');
 await db.query('delete from live_workout_room_members where athlete_user_id=$1',[id(1)]);
 assert.equal((await standings()).rows.length,5); // host without membership
 const {rows:permissions}=await db.query("select has_function_privilege('anon','get_live_workout_room_standings(uuid,competition_kind)','execute') anon, has_function_privilege('authenticated','get_live_workout_room_standings(uuid,competition_kind)','execute') authenticated");
 assert.deepEqual(permissions,[{anon:false,authenticated:true}]);
 await db.exec('set role anon'); await assert.rejects(standings,/permission denied/); await db.exec('reset role');
 console.log('PASS: original ambiguity reproduced; corrected SQL, scoring, lifecycle, room isolation, auth and ACL preservation verified.');
} finally { await db.close(); }
