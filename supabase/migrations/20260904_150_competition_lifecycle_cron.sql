-- PHATBOT competition lifecycle automation
-- Refresh live boards every 15 minutes, finalize due periods, award tied winners,
-- and create the current daily/weekly competition periods in America/New_York.

create extension if not exists pg_cron with schema extensions;

create or replace function public.phatbot_competition_lifecycle()
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_local_date date := (now() at time zone 'America/New_York')::date;
  v_daily_start timestamptz;
  v_daily_end timestamptz;
  v_daily_reconcile timestamptz;
  v_week_start_date date;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_week_reconcile timestamptz;
  r record;
begin
  v_daily_start := (v_local_date::timestamp at time zone 'America/New_York');
  v_daily_end := ((v_local_date + 1)::timestamp at time zone 'America/New_York');
  v_daily_reconcile := (((v_local_date + 1)::timestamp + interval '12 hours') at time zone 'America/New_York');

  v_week_start_date := v_local_date - (extract(isodow from v_local_date)::int - 1);
  v_week_start := (v_week_start_date::timestamp at time zone 'America/New_York');
  v_week_end := (((v_week_start_date + 6)::timestamp + interval '12 hours') at time zone 'America/New_York');
  v_week_reconcile := v_week_end + interval '5 minutes';

  insert into public.competition_periods(competition,cadence,period_start,period_end,reconcile_at,status,ruleset_version)
  select c,'daily'::public.competition_cadence,v_daily_start,v_daily_end,v_daily_reconcile,'open'::public.competition_period_status,'v3'
  from (values
    ('beast'::public.competition_kind),
    ('eager_beaver'::public.competition_kind),
    ('cardio_bunny'::public.competition_kind),
    ('step_king'::public.competition_kind)
  ) x(c)
  on conflict (competition,cadence,period_start) do nothing;

  insert into public.competition_periods(competition,cadence,period_start,period_end,reconcile_at,status,ruleset_version)
  select c,'weekly'::public.competition_cadence,v_week_start,v_week_end,v_week_reconcile,'open'::public.competition_period_status,'v3'
  from (values
    ('beast'::public.competition_kind),
    ('eager_beaver'::public.competition_kind),
    ('cardio_bunny'::public.competition_kind),
    ('step_king'::public.competition_kind)
  ) x(c)
  on conflict (competition,cadence,period_start) do nothing;

  -- Finalize due periods first. Finalization rebuilds once more before locking.
  for r in
    select id from public.competition_periods
    where status <> 'finalized'::public.competition_period_status
      and reconcile_at <= now()
    order by reconcile_at
  loop
    perform public.phatbot_finalize_competition_period(r.id);
  end loop;

  -- Keep all active boards fresh. Period bounds prevent late data leaking into
  -- a completed competition while it waits for its reveal/reconciliation time.
  for r in
    select id from public.competition_periods
    where status = 'open'::public.competition_period_status
      and period_start <= now()
      and reconcile_at > now()
    order by cadence,competition
  loop
    perform public.phatbot_rebuild_competition_period(r.id);
  end loop;
end
$$;

revoke all on function public.phatbot_competition_lifecycle() from public,anon,authenticated;

-- Replace any previous copy of this named job so the migration is safe to
-- evolve without leaving duplicate refresh workers behind.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='phatbot-competition-lifecycle' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'phatbot-competition-lifecycle',
  '*/15 * * * *',
  'select public.phatbot_competition_lifecycle();'
);
