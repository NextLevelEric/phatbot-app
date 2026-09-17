// Disposable PostgreSQL (PGlite) integration tests. No network or production access.
// Set PHATBOT_PGLITE_MODULE to an installed @electric-sql/pglite module file URL
// when it is not available through normal Node resolution.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PHATBOT_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
let passed = 0;
async function test(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
async function rejects(action, pattern) { await assert.rejects(action, pattern); }
async function asUser(id, action, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  try { return await action(); }
  finally { await db.exec('reset role'); await db.exec("select set_config('request.jwt.claim.sub','',false)"); }
}
async function replay(name, transform = s => s) {
  await db.exec('begin');
  try { await db.exec(transform(await fs.readFile(new URL(name, migrationDir), 'utf8'))); await db.exec('commit'); }
  catch (error) { await db.exec('rollback'); throw new Error(`Replay failed: ${name}`, { cause: error }); }
}

try {
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_admin nologin bypassrls;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
  `);
  // PGlite includes gen_random_uuid; pgcrypto extension loading is unnecessary.
  await replay('20260817_001_initial_phatbot_schema.sql', s => s.replace('create extension if not exists pgcrypto;', ''));
  // Minimal pre-program schema deltas. No assignment functions are mocked.
  await db.exec(`
    alter table public.exercises add column canonical_exercise_id uuid references public.exercises(id);
    alter table public.exercise_sessions alter column workout_exercise_id drop not null;
    alter table public.exercise_sessions add column prescribed_set_targets_snapshot text[] not null default '{}';
    alter table public.coach_profiles add column dashboard_enabled boolean not null default true;
    create schema cron;
    create table cron.job(jobid bigint generated always as identity, jobname text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid
    $$;
  `);
  await replay('20260904_110_competition_leaderboard_foundation.sql');
  await replay('20260824_106_test_workout_sessions.sql');
  await replay('20260825_104_extended_set_types.sql');
  await replay('20260829_110_healthkit_activity_history.sql');
  await replay('20260907_300_add_cardio_activity_segments.sql');
  await replay('20260912143627_bodyweight_measurements.sql');
  await replay('20260908_240_eric_current_program_v1.sql');
  // The historical file omits this retired production-only RPC body. It is
  // revoked by the next migration, and must never be used by these tests.
  await db.exec("create function public.enroll_in_current_eric_program() returns uuid language plpgsql as $$ begin raise exception 'Retired fixture RPC'; end $$");
  await db.exec("create function public.enroll_athlete_in_current_eric_program(uuid) returns uuid language plpgsql as $$ begin raise exception 'Retired fixture RPC'; end $$");
  await db.exec("create function public.default_new_athlete_to_eric_program() returns trigger language plpgsql as $$ begin raise exception 'Retired fixture trigger'; end $$");
  await replay('20260913091557_program_family_immutable_version_foundation.sql');
  await replay('20260913181458_athlete_program_assignments.sql');
  await replay('20260913203000_program_rotation_sequencing.sql');
  await replay('20260913214500_program_review_date_management.sql');
  await replay('20260914134427_scheduled_future_program_assignments.sql');
  await replay('20260916210539_assignment_optional_program_days.sql');
  console.log('Program migration chain replayed; cron registration stubbed, no scheduler executed.');

  const programDefinitions = () => rows(`select p.oid::regprocedure::text as name, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='phatbot_private' and p.proname in ('start_program_workout','guard_program_workout_session_link','advance_program_rotation_on_completion','activate_due_program_assignment'))
      or (n.nspname='public' and p.proname in ('skip_my_optional_program_day','start_my_optional_program_workout','start_my_next_program_workout'))
    order by name`);
  const beforeDefinitions = await programDefinitions();
  await replay('20260917121148_sunday_weekly_progress_reports.sql');
  await test('weekly migration replays after optional days without replacing any sequencing functions', async () => {
    assert.deepEqual(await programDefinitions(), beforeDefinitions);
    assert.equal(await scalar("select count(*)::int as value from cron.job where jobname='phatbot-weekly-progress-reports'"), 1);
  });

  const athlete = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  for (const id of [athlete,other]) await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
  const exercise = await scalar("insert into public.exercises(name) values('Fixture Curl') returning id as value");
  const family = await scalar("insert into public.program_families(slug,name,source_type,visibility) values('report-fixture','Six Day Fixture','phatbot_stock','stock_catalog') returning id as value");
  const program = await scalar("insert into public.training_programs(program_family_id,name,slug,version_number) values($1,'Six Day Fixture','report-fixture-v1',1) returning id as value", [family]);
  const days = [];
  for (let n=1;n<=6;n++) {
    const id = await scalar('insert into public.training_program_days(program_id,day_number,name) values($1,$2,$3) returning id as value',[program,n,`Day ${n}`]);
    days.push(id);
    await db.query("insert into public.training_program_exercises(program_day_id,exercise_id,position,prescribed_set_targets) values($1,$2,1,array['8'])",[id,exercise]);
  }
  await db.query("update public.training_programs set status='published',published_at=now() where id=$1",[program]);
  const assignment = await asUser(athlete,()=>scalar("select (public.assign_program_to_athlete($1,$2,'athlete_selected')).id as value",[athlete,program]));
  await db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])',[assignment,[days[5]]]);
  await db.query('update public.athlete_program_enrollments set next_program_day_id=$1 where id=$2',[days[5],assignment]);
  const state = async () => (await rows('select next_program_day_id,program_cursor_revision from public.athlete_program_enrollments where id=$1',[assignment]))[0];
  const startAt = '2026-09-13T04:00:00Z', endAt = '2026-09-20T04:00:00Z', readyAt = '2026-09-20T16:30:00Z';
  const build = (user=athlete) => scalar('select phatbot_private.build_weekly_progress_report($1,$2,$3,$4) as value',[user,startAt,endAt,readyAt]);
  const protectedTables = ['workout_sessions','exercise_sessions','sets','exercise_scores','workout_scores','weekly_scores','competition_periods','competition_entries','competition_awards'];
  async function snapshot() {
    const result={};
    for(const table of protectedTables) result[table]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from public.${table} t`);
    return result;
  }
  await test('optional skip is absent from report, legacy scores and all competition/training state', async () => {
    const priorReport=await build(), before=await snapshot(), revision=(await state()).program_cursor_revision;
    assert.equal(await asUser(athlete,()=>scalar('select public.skip_my_optional_program_day($1,$2,$3) as value',[assignment,days[5],revision])),true);
    assert.deepEqual(await snapshot(),before); assert.deepEqual(await build(),priorReport);
    assert.equal((await state()).next_program_day_id,days[0]);
  });
  let bonus, exerciseSession;
  await test('completed optional bonus is real report work while Day 1 remains next', async () => {
    const before=await state();
    bonus=await asUser(athlete,()=>scalar('select public.start_my_optional_program_workout($1,$2) as value',[assignment,days[5]]));
    exerciseSession=await scalar('select id as value from public.exercise_sessions where workout_session_id=$1',[bonus]);
    await db.query("insert into public.sets(exercise_session_id,set_number,set_type,weight,reps) values($1,1,'working',100,10),($1,2,'warmup',45,10),($1,3,'tempo',50,5),($1,4,'timed',999,10)",[exerciseSession]);
    await asUser(athlete,()=>db.query("update public.workout_sessions set status='completed',completed_at='2026-09-15T14:00:00Z' where id=$1",[bonus]));
    const payload=await build();
    assert.equal(payload.workouts.completed,1); assert.equal(Number(payload.training_volume.value),1250);
    assert.deepEqual(await state(),before);
    assert.equal(payload.progressive_overload.status,'incomplete');
    assert.equal(payload.progressive_overload.average_score_percent,null); assert.equal(payload.progressive_overload.wins,null);
  });
  await test('baseline-only coverage stays distinct from an actual zero PO score', async () => {
    await db.query("insert into public.exercise_scores(athlete_user_id,workout_session_id,exercise_session_id,result,score) values($1,$2,$3,'baseline',0)",[athlete,bonus,exerciseSession]);
    const payload=await build(); assert.equal(payload.progressive_overload.status,'baseline_only'); assert.equal(payload.progressive_overload.average_score_percent,null);
  });
  await test('missing workout score remains incomplete until persisted scoring is complete', async () => {
    await db.query("update public.exercise_scores set result='progression',score=1 where exercise_session_id=$1",[exerciseSession]);
    assert.equal((await build()).progressive_overload.status,'incomplete');
    await db.query('insert into public.workout_scores(athlete_user_id,workout_session_id,score,scored_exercise_count,progression_count) values($1,$2,1,1,1)',[athlete,bonus]);
    const payload=await build(); assert.equal(payload.progressive_overload.status,'available'); assert.equal(payload.progressive_overload.average_score_percent,100); assert.equal(payload.progressive_overload.wins,1);
  });
  await test('Sunday bounds include the exact opening instant and exclude the closing instant/test/cancelled work', async () => {
    for(const [at,status,isTest] of [[startAt,'completed',false],[endAt,'completed',false],['2026-09-13T03:59:59Z','completed',false],['2026-09-15T14:00:00Z','completed',true],['2026-09-15T14:00:00Z','cancelled',false]]) {
      await db.query('insert into public.workout_sessions(athlete_user_id,workout_name_snapshot,status,completed_at,is_test) values($1,$2,$3,$4,$5)',[other,'Boundary fixture',status,at,isTest]);
    }
    assert.equal((await build(other)).workouts.completed,1);
    for(const [date,hours] of [['2026-03-08',167],['2026-11-01',169]]) {
      assert.equal(Number(await scalar("select extract(epoch from ((($1::date+7)::timestamp at time zone 'America/New_York')-($1::date::timestamp at time zone 'America/New_York')))/3600 as value",[date])),hours);
    }
  });
  await test('finalized hardware retains its separate competition window; open awards are excluded', async () => {
    for(const status of ['finalized','open']) {
      const period=await scalar("insert into public.competition_periods(competition,cadence,period_start,period_end,reconcile_at,status,finalized_at) values('beast','weekly',$1,'2026-09-14T04:00:00Z','2026-09-14T16:00:00Z',$2,'2026-09-14T16:00:00Z') returning id as value",[status==='finalized'?'2026-09-07T04:00:00Z':'2026-09-06T04:00:00Z',status]);
      await db.query("insert into public.competition_awards(period_id,athlete_user_id,rank,award_key) values($1,$2,1,'beast_champion')",[period,athlete]);
    }
    const payload=await build(); assert.equal(payload.hardware.length,1);
    assert.equal(new Date(payload.hardware[0].period_start).toISOString(),'2026-09-07T04:00:00.000Z');
  });
  await test('cardio improvements use comparable efforts and partial step coverage is not a zero total', async () => {
    for(const [key,at,duration] of [['prior','2026-09-12T12:00:00Z',400],['current','2026-09-15T12:00:00Z',380]]) {
      const activity=await scalar("insert into public.cardio_activities(athlete_user_id,source_workout_id,activity_type,started_at,ended_at,duration_seconds,distance_meters) values($1,$2,37,$3,$3::timestamptz+interval '10 minutes',600,1609.344) returning id as value",[athlete,key,at]);
      await db.query("insert into public.cardio_activity_segments(athlete_user_id,cardio_activity_id,segment_key,segment_label,distance_meters,duration_seconds,end_offset_seconds,source) values($1,$2,'mile','Mile',1609.344,$3,$3,'fixture')",[athlete,activity,duration]);
    }
    await db.query("insert into public.health_daily_metrics(athlete_user_id,metric_date,steps) values($1,'2026-09-15',12000)",[athlete]);
    const payload=await build(); assert.equal(payload.cardio.sessions,1); assert.equal(Number(payload.cardio.comparable_improvements[0].improvement_seconds),20);
    assert.equal(payload.steps.status,'unavailable'); assert.equal(payload.steps.total,null);
  });

  // Fixed clock ONLY inside this disposable DB, so the unchanged finalizer can
  // be tested before its first production-ready Sunday. No migration SQL edits.
  await db.exec(`create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql volatile as $$ select current_setting('phatbot.fixture_clock')::timestamptz $$`);
  const clock = at => db.query("select set_config('phatbot.fixture_clock',$1,false)",[at]);
  const finalize = () => asUser(athlete,()=>scalar('select public.finalize_my_weekly_progress_report($1) as value',[startAt]));
  await test('finalization rejects invalid bounds and waits until 12:30 Eastern', async () => {
    await clock('2026-09-20T16:29:59Z');
    await rejects(finalize,/not ready/);
    await rejects(()=>asUser(athlete,()=>scalar("select public.finalize_my_weekly_progress_report('2026-09-14T04:00:00Z') as value")),/Sunday at midnight/);
    await rejects(()=>asUser(athlete,()=>scalar("select public.finalize_my_weekly_progress_report('2026-09-06T04:00:00Z') as value")),/launch-forward/);
  });
  let reportId, frozen;
  await test('ready finalization creates exactly one immutable snapshot without changing source/legacy tables', async () => {
    await clock(readyAt); const before=await snapshot(); reportId=await finalize();
    frozen=await scalar('select report_payload as value from public.weekly_progress_reports where id=$1',[reportId]);
    assert.equal(frozen.workouts.completed,1); assert.deepEqual(await snapshot(),before);
    assert.equal(await finalize(),reportId);
    await rejects(()=>db.query("update public.weekly_progress_reports set calculation_version='changed' where id=$1",[reportId]),/immutable/);
  });
  await test('late source changes never rebuild an existing finalized snapshot', async () => {
    await db.query("insert into public.sets(exercise_session_id,set_number,weight,reps) values($1,5,50,10)",[exerciseSession]);
    assert.equal(Number((await build()).training_volume.value),1750);
    assert.equal(await finalize(),reportId);
    assert.deepEqual(await scalar('select report_payload as value from public.weekly_progress_reports where id=$1',[reportId]),frozen);
  });
  await test('report RLS and function grants reject cross-athlete reads, direct writes and anonymous finalization', async () => {
    assert.equal(await asUser(athlete,()=>scalar('select count(*)::int as value from public.weekly_progress_reports')),1);
    assert.equal(await asUser(other,()=>scalar('select count(*)::int as value from public.weekly_progress_reports')),0);
    await rejects(()=>asUser(athlete,()=>db.query('delete from public.weekly_progress_reports where id=$1',[reportId])),/permission denied/);
    await rejects(()=>asUser(athlete,()=>db.query("insert into public.weekly_progress_reports(athlete_user_id,period_start,period_end,calculation_version,report_payload) values($1,$2,$3,'fake','{}')",[athlete,startAt,endAt])),/permission denied/);
    await rejects(()=>asUser(other,()=>scalar('select phatbot_private.finalize_weekly_progress_report($1,$2) as value',[athlete,startAt])),/permission denied/);
    await rejects(()=>asUser(null,()=>scalar('select public.finalize_my_weekly_progress_report($1) as value',[startAt]),'anon'),/permission denied/);
  });
  await test('cron respects its Eastern Sunday retry window and remains idempotent', async () => {
    assert.equal(await scalar("select phatbot_private.finalize_due_weekly_progress_reports('2026-09-20T16:29:59Z') as value"),0);
    assert.equal(await scalar("select phatbot_private.finalize_due_weekly_progress_reports('2026-09-20T18:00:00Z') as value"),0);
    assert.equal(await scalar("select phatbot_private.finalize_due_weekly_progress_reports('2026-09-21T16:30:00Z') as value"),0);
    await scalar("select phatbot_private.finalize_due_weekly_progress_reports('2026-09-20T16:30:00Z') as value");
    assert.equal(await finalize(),reportId);
    assert.deepEqual(await scalar('select report_payload as value from public.weekly_progress_reports where id=$1',[reportId]),frozen);
  });
  console.log(`All ${passed} refreshed weekly-report PostgreSQL scenarios passed (fixture-only clock; scheduler registration stubbed).`);
} catch(error) {
  console.error(error.message, error.cause?.message ?? ''); process.exitCode=1;
} finally { await db.close(); }
