// Isolated PostgreSQL replay: no network, credentials, or production access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PHATBOT_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
async function asUser(id,fn,role='authenticated') {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  try{return await fn();}finally{await db.exec('reset role');}
}
const insert=`insert into public.health_sleep_nights(athlete_user_id,source,wake_date,time_zone,interval_start,interval_end,asleep_seconds,raw_samples,method_version,observed_at,window_start,window_end) values ($1,'healthkit','2026-09-28','America/New_York','2026-09-28T03:00Z','2026-09-28T11:00Z',28800,'[]',1,'2026-09-29T12:00Z','2026-09-15T12:00Z','2026-09-29T12:00Z')`;
try {
  await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;insert into auth.users values ('${owner}'),('${other}');`);
  await test('pending migration replays transactionally',async()=>{
    const sql=await fs.readFile(new URL('../supabase/migrations/20260930193925_sleep_recovery_nights.sql',import.meta.url),'utf8');
    await db.exec(`begin;${sql}commit;`);
  });
  await test('owner insert and repeat upsert retain one night',()=>asUser(owner,async()=>{
    await db.query(insert,[owner]);await db.query(insert+' on conflict (athlete_user_id,source,wake_date) do update set asleep_seconds=excluded.asleep_seconds',[owner]);
    assert.equal((await db.query('select * from health_sleep_nights')).rows.length,1);
  }));
  await test('other athlete cannot read or update owner night',()=>asUser(other,async()=>{
    assert.equal((await db.query('select * from health_sleep_nights')).rows.length,0);
    assert.equal((await db.query('update health_sleep_nights set asleep_seconds=1 returning *')).rows.length,0);
    await assert.rejects(db.query(insert,[owner]),/row-level security/);
  }));
  await test('owner cannot transfer ownership or delete history',()=>asUser(owner,async()=>{
    await assert.rejects(db.query('update health_sleep_nights set athlete_user_id=$1',[other]),/row-level security/);
    await assert.rejects(db.query('delete from health_sleep_nights'),/permission denied/);
  }));
  await test('anonymous access denied and absent user sees no rows',async()=>{
    await asUser('',()=>assert.rejects(db.query('select * from health_sleep_nights'),/permission denied/),'anon');
    await asUser('',async()=>assert.equal((await db.query('select * from health_sleep_nights')).rows.length,0));
  });
  await test('constraints reject negative, malformed and impossible sleep',()=>asUser(owner,async()=>{
    for(const assignment of ["asleep_seconds=-1","raw_samples='{}'","stages='[]'","interval_end=interval_start","wake_time=interval_end","method_version=2"])
      await assert.rejects(db.query(`update health_sleep_nights set ${assignment}`),/check constraint/);
  }));
  console.log(`${passed} disposable migration/access-control checks passed.`);
}finally{await db.close();}
