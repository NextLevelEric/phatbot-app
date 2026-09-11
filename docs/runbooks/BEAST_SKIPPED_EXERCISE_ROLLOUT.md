# Beast skipped-exercise scoring rollout

This runbook applies only `20260911180023_fix_beast_skipped_exercise_scoring.sql`.
Do not use `supabase db push`: the repository and production migration ledgers still
contain older timestamp bookkeeping differences that must be reconciled separately.

## 1. Pre-deployment read-only checks

Confirm the two production definitions are still the versions reviewed for this
change. Stop if either MD5 differs.

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) definition_md5
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'phatbot_rebuild_competition_period',
    'get_live_workout_room_beast'
  )
order by p.proname;
```

Expected before deployment:

- `get_live_workout_room_beast`: `46878ad177d00af2e8960c0ca6200f5b`
- `phatbot_rebuild_competition_period`: `a064d839565bf5b2ee502fc64d7be227`

Capture finalized-period fingerprints and save the result outside the database:

```sql
with finalized as (
  select id,competition,cadence,period_start,period_end,reconcile_at,status,
    ruleset_version,finalized_at
  from public.competition_periods
  where status='finalized'
), entry_fingerprint as (
  select md5(coalesce(string_agg(
    concat_ws('|',e.id,e.period_id,e.athlete_user_id,e.score,e.rank,
      e.result_label,e.explanation,e.source_ref::text,e.is_eligible),
    E'\n' order by e.id),'')) value
  from public.competition_entries e join finalized f on f.id=e.period_id
), award_fingerprint as (
  select md5(coalesce(string_agg(
    concat_ws('|',a.id,a.period_id,a.athlete_user_id,a.rank,a.award_key,a.awarded_at),
    E'\n' order by a.id),'')) value
  from public.competition_awards a join finalized f on f.id=a.period_id
)
select
  (select count(*) from finalized) finalized_period_count,
  (select count(*) from public.competition_entries e join finalized f on f.id=e.period_id) finalized_entry_count,
  (select count(*) from public.competition_awards a join finalized f on f.id=a.period_id) finalized_award_count,
  (select value from entry_fingerprint) finalized_entries_md5,
  (select value from award_fingerprint) finalized_awards_md5;
```

Capture the current active Beast periods and entries:

```sql
select p.id period_id,p.cadence,p.status,p.period_start,p.period_end,p.reconcile_at,
  e.athlete_user_id,e.rank,e.score,e.result_label,e.source_ref
from public.competition_periods p
left join public.competition_entries e on e.period_id=p.id
where p.competition='beast'
  and p.status='open'
  and p.period_start<=now()
  and p.reconcile_at>now()
order by p.cadence,e.rank nulls last,e.athlete_user_id;
```

## 2. Apply only the reviewed forward SQL

The existing competition lifecycle job runs every 15 minutes and rebuilds open
periods. Begin this step immediately after an observed successful lifecycle run so
the guarded manual checks can finish before the next scheduled run. Do not pause,
reschedule, or otherwise change the lifecycle job for this rollout.

Apply the contents of
`supabase/migrations/20260911180023_fix_beast_skipped_exercise_scoring.sql`
as a single statement batch. Do not run the migration directory or any other
pending migration. The forward SQL replaces definitions and privileges only; it
does not rebuild a period.

Confirm the deployed contracts:

```sql
select p.proname,
  pg_get_function_identity_arguments(p.oid) arguments,
  pg_get_function_result(p.oid) result_type,
  p.prosecdef security_definer,
  p.provolatile volatility,
  p.proconfig settings,
  p.proacl::text acl,
  position('current_eligible_set_count>0 and previous_total>0'
    in pg_get_functiondef(p.oid))>0 has_corrected_eligibility
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'phatbot_rebuild_competition_period',
    'get_live_workout_room_beast'
  )
order by p.proname;
```

Expected:

- Rebuild: argument `p_period_id uuid`, result `void`, definer `true`, volatility
  `v`, `search_path=public`, service-role execution only, corrected eligibility
  `true`.
- Train Together: argument `p_room_id uuid`, unchanged table result, definer
  `true`, volatility `s`, `search_path=public`, authenticated and service-role
  execution only, corrected eligibility `true`.

## 3. Rebuild only the current Daily Beast period

This block refuses to run unless exactly one active open Daily Beast period exists.

```sql
do $$
declare
  v_period_id uuid;
  v_count integer;
begin
  select count(*),(array_agg(id order by period_start desc))[1]
    into v_count,v_period_id
  from public.competition_periods
  where competition='beast'
    and cadence='daily'
    and status='open'
    and period_start<=now()
    and reconcile_at>now();

  if v_count<>1 then
    raise exception 'Expected exactly one active open Daily Beast period; found %',v_count;
  end if;

  perform public.phatbot_rebuild_competition_period(v_period_id);
end
$$;
```

Compare the rebuilt Daily board with the saved pre-deployment output:

```sql
select e.rank,e.score,e.result_label,
  (e.source_ref->>'current_lift_total')::numeric current_lift_total,
  (e.source_ref->>'previous_lift_total')::numeric previous_lift_total,
  (e.source_ref->>'comparable_exercises')::integer comparable_exercises,
  e.source_ref->>'method' method
from public.competition_entries e
join public.competition_periods p on p.id=e.period_id
where p.competition='beast'
  and p.cadence='daily'
  and p.status='open'
  and p.period_start<=now()
  and p.reconcile_at>now()
order by e.rank,e.athlete_user_id;
```

For the reviewed Daily fixture, expect four entries and unchanged ranks. The
three known score corrections are `-24.38 -> 3.04`, `-52.00 -> 0.39`, and
`-83.11 -> -65.84`. The QA row must show current volume `7060`, previous volume
`20670`, and one comparable exercise. That negative score confirms performed
lower work is still counted; the dropped prior volume confirms skipped exercises
contribute nothing.

## 4. Rebuild only the current Weekly Beast period

Run only after Daily verification succeeds. This block has the same single-period
guard.

```sql
do $$
declare
  v_period_id uuid;
  v_count integer;
begin
  select count(*),(array_agg(id order by period_start desc))[1]
    into v_count,v_period_id
  from public.competition_periods
  where competition='beast'
    and cadence='weekly'
    and status='open'
    and period_start<=now()
    and reconcile_at>now();

  if v_count<>1 then
    raise exception 'Expected exactly one active open Weekly Beast period; found %',v_count;
  end if;

  perform public.phatbot_rebuild_competition_period(v_period_id);
end
$$;
```

Re-run the active-period query from step 1. At preparation time the Weekly board
had eight entries and no score or rank changes under the corrected calculation.

## 5. Confirm finalized history is untouched

Re-run the finalized fingerprint query from step 1. All five returned values must
match the saved pre-deployment output exactly. Stop and roll back if any differ.

After all checks pass, record only this migration version as applied. This command
updates migration bookkeeping only and may request the production database password:

```powershell
supabase migration repair 20260911180023 --status applied --project-ref fwcokqxhqrivrjazmoyd
```

Do not run a general migration push as a substitute.

## 6. Train Together runtime verification

Use two existing QA accounts on real devices. Start or join a Train Together room
using a workout with prior baselines. Record lower eligible work for one exercise
and leave another exercise untouched. Refresh the live standings and verify the
score uses only the performed exercise and remains negative. Add eligible work to
the second exercise and confirm it then joins the comparison. Cancel both QA
workouts instead of completing them so this runtime check cannot enter official
competition standings.

## Rollback

Apply only
`supabase/rollbacks/20260911180023_fix_beast_skipped_exercise_scoring.rollback.sql`.
Confirm the two definition MD5 values again match the pre-deployment values above.
Then rebuild only the active Daily and Weekly Beast periods using the guarded
blocks above so live entries return to the preceding algorithm. Re-run the
finalized fingerprints; they must remain unchanged. Then mark only this migration
version reverted:

```powershell
supabase migration repair 20260911180023 --status reverted --project-ref fwcokqxhqrivrjazmoyd
```
