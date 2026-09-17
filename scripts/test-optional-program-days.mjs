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

  const athlete = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  const coach = '00000000-0000-0000-0000-000000000003';
  const outsider = '00000000-0000-0000-0000-000000000004';
  for (const id of [athlete, other, coach, outsider]) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `fixture-${id}@example.test`]);
  }
  await db.query('insert into public.coach_profiles(user_id) values($1)', [coach]);
  await db.query('insert into public.coach_athletes(coach_user_id,athlete_user_id) values($1,$2)', [coach, athlete]);
  const exercise = await scalar("insert into public.exercises(name) values('Fixture curl') returning id as value");
  const family = await scalar("insert into public.program_families(slug,name,source_type,visibility) values('optional-test','Fixture Six Day','phatbot_stock','stock_catalog') returning id as value");
  async function program(version) {
    const id = await scalar("insert into public.training_programs(program_family_id,name,slug,version_number) values($1,'Fixture Six Day',$2,$3) returning id as value", [family, `optional-test-v${version}`, version]);
    const days = [];
    for (let n = 1; n <= 6; n++) {
      const day = await scalar('insert into public.training_program_days(program_id,day_number,name) values($1,$2,$3) returning id as value', [id, n, `Day ${n}`]);
      days.push(day);
      await db.query("insert into public.training_program_exercises(program_day_id,exercise_id,position,prescribed_set_targets) values($1,$2,1,array['8','8'])", [day, exercise]);
    }
    await db.query("update public.training_programs set status='published',published_at=now() where id=$1", [id]);
    return { id, days };
  }
  const version = await program(1), secondVersion = await program(2);
  const assignment = await asUser(athlete, () => scalar("select (public.assign_program_to_athlete($1,$2,'athlete_selected')).id as value", [athlete, version.id]));
  const normalAssignment = await asUser(other, () => scalar("select (public.assign_program_to_athlete($1,$2,'athlete_selected')).id as value", [other, version.id]));
  const state = async (id = assignment) => (await rows('select next_program_day_id,program_cursor_revision,optional_program_day_ids,status,started_at from public.athlete_program_enrollments where id=$1', [id]))[0];
  const setDay = async (day, id = assignment) => db.query('update public.athlete_program_enrollments set next_program_day_id=$1 where id=$2', [day, id]);
  const start = () => asUser(athlete, () => scalar('select public.start_my_next_program_workout() as value'));
  const startOptional = (id = assignment, day = version.days[5]) => asUser(athlete, () => scalar('select public.start_my_optional_program_workout($1,$2) as value', [id, day]));
  const skip = (revision, id = assignment, day = version.days[5], user = athlete) => asUser(user, () => scalar('select public.skip_my_optional_program_day($1,$2,$3) as value', [id, day, revision]));
  async function logSet(session) {
    const ex = await scalar('select id as value from public.exercise_sessions where workout_session_id=$1 limit 1', [session]);
    await asUser(athlete, () => db.query('insert into public.sets(exercise_session_id,set_number,weight,reps) values($1,1,20,8)', [ex]));
  }
  async function complete(session) {
    await logSet(session);
    await asUser(athlete, () => db.query("update public.workout_sessions set status='completed',completed_at=now() where id=$1", [session]));
  }
  const period = await scalar("insert into public.competition_periods(competition,cadence,period_start,period_end,reconcile_at) values('beast','weekly',now(),now()+interval '7 days',now()+interval '8 days') returning id as value");
  await db.query('insert into public.competition_entries(period_id,athlete_user_id,score) values($1,$2,42)', [period,athlete]);
  const protectedTables = ['competition_periods','competition_entries','competition_awards','workouts','workout_sessions','exercise_sessions','sets','exercise_scores','workout_scores','personal_records','weekly_scores','training_programs','training_program_days','training_program_exercises','athlete_program_workouts'];
  async function protectedSnapshot() {
    const snapshot = {};
    for (const table of protectedTables) snapshot[table] = await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from public.${table} t`);
    return snapshot;
  }

  await test('required Day 5 completion leads to required Day 6', async () => {
    await setDay(version.days[4]); await complete(await start());
    assert.equal((await state()).next_program_day_id, version.days[5]);
    const options = await asUser(athlete, () => rows('select * from public.get_program_day_options()'));
    assert.equal(options.find(o => o.day_number === 6).is_optional, false);
    await rejects(() => skip((0)), /Only configured optional/);
  });
  await test('required final day wraps normally', async () => {
    await complete(await start()); assert.equal((await state()).next_program_day_id,version.days[0]);
  });
  await test('unlinked custom/cardio completion leaves rotation unchanged', async () => {
    const before=await state();
    const session=await asUser(athlete,()=>scalar("insert into public.workout_sessions(athlete_user_id,workout_name_snapshot,status) values($1,'Custom / Cardio','in_progress') returning id as value",[athlete]));
    await asUser(athlete,()=>db.query("update public.workout_sessions set status='completed',completed_at=now() where id=$1",[session]));
    assert.deepEqual(await state(),before);
  });
  await test('server configuration leaves immutable program content and other assignments unchanged', async () => {
    const before = await protectedSnapshot(), normal = await state(normalAssignment);
    await asUser(null, () => db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [assignment, [version.days[5]]]), 'service_role');
    assert.deepEqual(await protectedSnapshot(), before);
    assert.deepEqual(await state(normalAssignment), normal);
  });
  await test('optional Day 5 completion presents optional Day 6', async () => {
    await setDay(version.days[4]); await complete(await start());
    const options = await asUser(athlete, () => rows('select * from public.get_program_day_options()'));
    const six = options.find(o => o.day_number === 6);
    assert.equal(six.is_optional, true); assert.equal(six.next_program_day_id, six.program_day_id); assert.equal(six.following_day_number, 1);
  });
  await test('starting expected optional Day 6 completes normally and wraps once', async () => {
    const session = await start(); await complete(session);
    const after = await state(); assert.equal(after.next_program_day_id, version.days[0]);
    await asUser(athlete, () => db.query("update public.workout_sessions set status='completed' where id=$1", [session]));
    assert.deepEqual(await state(), after);
  });
  let skippedRevision;
  await test('skip changes only assignment sequence, with no history/score/PO writes', async () => {
    await setDay(version.days[5]); skippedRevision = (await state()).program_cursor_revision;
    const before = await protectedSnapshot();
    assert.equal(await skip(skippedRevision), true);
    assert.equal((await state()).next_program_day_id, version.days[0]);
    assert.deepEqual(await protectedSnapshot(), before);
    assert.equal(await skip(skippedRevision), false);
    assert.equal((await state()).next_program_day_id, version.days[0]);
  });
  await test('bonus Day 6 after skip records real work without moving Day 1', async () => {
    const before = await state(); const session = await startOptional(); await complete(session);
    assert.deepEqual(await state(), before);
    assert.equal(await scalar('select program_sequence_advanced_at as value from public.workout_sessions where id=$1', [session]), null);
    assert.equal(await scalar("select status::text as value from public.workout_sessions where id=$1", [session]), 'completed');
    assert.equal(await scalar('select count(*)::int as value from public.sets s join public.exercise_sessions e on e.id=s.exercise_session_id where e.workout_session_id=$1', [session]), 1);
  });
  await test('Day 1 after bonus completion advances to Day 2', async () => {
    await complete(await start()); assert.equal((await state()).next_program_day_id, version.days[1]);
  });
  await test('old skip request cannot skip again after a full wrap back to Day 6', async () => {
    await setDay(version.days[5]); const before = await state();
    assert.equal(await skip(skippedRevision), false); assert.deepEqual(await state(), before);
  });
  await test('in-progress protection prevents skip and duplicate/bonus starts', async () => {
    const session = await start(); const before = await state();
    await rejects(() => skip(before.program_cursor_revision), /Complete or cancel/);
    await rejects(startOptional, /Complete or cancel/);
    await rejects(start, /Complete or cancel/);
    await asUser(athlete, () => db.query("update public.workout_sessions set status='cancelled' where id=$1", [session]));
    assert.deepEqual(await state(), before);
  });
  await test('completion without logged sets is rejected; start alone does not advance', async () => {
    const before = await state(), session = await startOptional();
    assert.deepEqual(await state(), before);
    await rejects(() => asUser(athlete, () => db.query("update public.workout_sessions set status='completed' where id=$1", [session])), /Log at least one set/);
    await db.query("update public.workout_sessions set status='cancelled' where id=$1", [session]);
  });
  await test('another athlete cannot read, skip or start optional days on this assignment', async () => {
    await rejects(() => skip((0), assignment, version.days[5], other), /Own active/);
    await rejects(() => asUser(other, () => scalar('select public.start_my_optional_program_workout($1,$2) as value', [assignment, version.days[5]])), /Assignment changed/);
    await rejects(() => asUser(other, () => rows('select * from public.get_program_day_options($1)', [athlete])), /Not authorized/);
    assert.equal(await asUser(other, () => scalar('select count(*)::int as value from public.athlete_program_enrollments where id=$1', [assignment])), 0);
  });
  await test('clients cannot configure optional days, edit the cursor, or call private primitives', async () => {
    for (const user of [athlete, coach, outsider]) {
      await rejects(() => asUser(user, () => db.query('update public.athlete_program_enrollments set optional_program_day_ids=$1 where id=$2', [[version.days[0]], assignment])), /permission denied/);
      await rejects(() => asUser(user, () => db.query('update public.athlete_program_enrollments set next_program_day_id=$1 where id=$2', [version.days[0], assignment])), /permission denied/);
      await rejects(() => asUser(user, () => db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [assignment, [version.days[0]]])), /permission denied/);
    }
    await rejects(() => asUser(null, () => db.query('select public.skip_my_optional_program_day($1,$2,0)', [assignment, version.days[5]]), 'anon'), /permission denied/);
    await rejects(() => startOptional(assignment, version.days[0]), /Only configured optional/);
  });
  await test('active coach can read options but cannot skip for the athlete', async () => {
    const options = await asUser(coach, () => rows('select * from public.get_program_day_options($1)', [athlete]));
    assert.equal(options.find(o => o.assignment_id === assignment && o.day_number === 6).is_optional, true);
    await rejects(() => skip(0, assignment, version.days[5], coach), /Own active/);
  });
  await test('configuration rejects foreign/null/duplicate days and all-optional rotations', async () => {
    for (const ids of [[secondVersion.days[5]], [null], [version.days[5],version.days[5]], version.days]) {
      await rejects(() => db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [assignment, ids]), /Optional days|retain at least one/);
    }
  });
  let scheduled;
  await test('scheduled assignment accepts options in place before activation', async () => {
    scheduled = await asUser(coach, () => scalar("select (public.schedule_program_for_athlete($1,$2,(now() at time zone 'America/New_York')::date+7,null)).id as value", [athlete, version.id]));
    const before = await state(scheduled);
    await db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [scheduled, [version.days[5]]]);
    assert.equal((await state(scheduled)).started_at.toISOString(), before.started_at.toISOString());
    assert.equal((await state(scheduled)).status, 'scheduled');
    await rejects(async () => skip((await state(scheduled)).program_cursor_revision, scheduled), /Own active/);
  });
  await test('activation preserves assignment ID, date and optional configuration', async () => {
    const before = await state(scheduled);
    await db.query('select phatbot_private.activate_due_program_assignment($1,$2)', [athlete, before.started_at]);
    const after = await state(scheduled);
    assert.equal(after.status, 'active'); assert.deepEqual(after.optional_program_day_ids, [version.days[5]]);
    assert.equal(after.started_at.toISOString(), before.started_at.toISOString());
    assert.equal(after.next_program_day_id, version.days[0]);
    assert.deepEqual((await state()).optional_program_day_ids, [version.days[5]]);
    await rejects(() => db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [assignment, []]), /Only current or scheduled/);
  });
  await test('rescheduling a different version clears old-version options', async () => {
    const upcoming = await asUser(coach, () => scalar("select (public.schedule_program_for_athlete($1,$2,(now() at time zone 'America/New_York')::date+8,null)).id as value", [athlete, version.id]));
    await db.query('select phatbot_private.set_assignment_optional_days($1,$2::uuid[])', [upcoming, [version.days[5]]]);
    const updated = await asUser(coach, () => scalar("select (public.schedule_program_for_athlete($1,$2,(now() at time zone 'America/New_York')::date+9,null)).id as value", [athlete, secondVersion.id]));
    assert.equal(updated, upcoming); assert.deepEqual((await state(upcoming)).optional_program_day_ids, []);
  });
  await test('controlled rollout script configures exactly four scheduled assignments and safely repeats', async () => {
    let script = await fs.readFile(new URL('../supabase/operations/configure_strength_optional_day_6.sql', import.meta.url), 'utf8');
    const users = ['c741a36c-18d0-4083-a8ad-bb6fa9f4df6a', 'b913f426-6d63-4985-bc57-cd7b74b08351', '3a51aead-c22b-4f7b-8560-0b3746eef2e1', 'd2ca0b20-297c-4f22-891a-d01129dacb1b'];
    const assignments = ['e558ca4b-aa2b-4c86-9713-3a60f9265aa2', '9d54cb05-f659-4532-a5a5-b822d76bd0f5', 'd6c3d36a-c839-4796-b3f3-e494f71ae3a7', '6dc06525-4624-43fc-909d-1f8606b191ec', '0e1d335e-02e3-4969-96e7-f27a36346f6e', '9fedb561-2243-4d25-bf7b-e4dd76de68c0'];
    const fixtureAssignments = [];
    for (let n = 0; n < 6; n++) {
      const user = await scalar("insert into auth.users(id,email) values(gen_random_uuid(),$1) returning id as value", [`rollout-${n}@example.test`]);
      const id = await scalar("insert into public.athlete_program_enrollments(athlete_user_id,program_id,status,source_type,started_at,next_program_day_id) values($1,$2,'scheduled','system_migration','2026-09-21T04:00:00Z',$3) returning id as value", [user, version.id, version.days[0]]);
      if (users[n]) script = script.replaceAll(users[n], user);
      script = script.replaceAll(assignments[n], id); fixtureAssignments.push(id);
    }
    script = script.replaceAll('56fe6b12-a354-4c8e-bf82-d0e9bcf414c2', version.id)
      .replaceAll('c147a358-3af0-4a92-a921-b712aa512314', version.days[0])
      .replaceAll('56c31f74-6b8c-4edd-a61c-8c92be8e3228', version.days[5]);
    const before = await protectedSnapshot();
    await db.exec(script); // Default dry run must leave all options empty.
    for (const id of fixtureAssignments) assert.deepEqual((await state(id)).optional_program_day_ids, []);
    const approvedFixtureScript = script.replace(/rollback;\s*$/i, 'commit;');
    await db.exec(approvedFixtureScript);
    const revisions = [];
    for (let n = 0; n < 6; n++) {
      const result = await state(fixtureAssignments[n]); revisions.push(result.program_cursor_revision);
      assert.deepEqual(result.optional_program_day_ids, n < 4 ? [version.days[5]] : []);
      assert.equal(result.status, 'scheduled');
    }
    await db.exec(approvedFixtureScript);
    for (let n = 0; n < 6; n++) assert.equal((await state(fixtureAssignments[n])).program_cursor_revision, revisions[n]);
    assert.deepEqual(await protectedSnapshot(), before);
    await db.query("update public.athlete_program_enrollments set started_at=started_at+interval '1 day' where id=$1", [fixtureAssignments[0]]);
    await rejects(() => db.exec(approvedFixtureScript), /Scheduled assignment changed/);
    await db.exec('rollback');
  });
  console.log(`All ${passed} disposable database integration scenarios passed.`);
} finally { await db.close(); }
