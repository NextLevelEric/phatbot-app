create or replace function public.phatbot_competition_lifecycle()
returns void
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
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
  select c,'daily'::public.competition_cadence,v_daily_start,v_daily_end,v_daily_reconcile,'open'::public.competition_period_status,
    case when c='cardio_bunny'::public.competition_kind then 'v4' else 'v3' end
  from (values ('beast'::public.competition_kind),('eager_beaver'::public.competition_kind),('cardio_bunny'::public.competition_kind),('step_king'::public.competition_kind)) x(c)
  on conflict (competition,cadence,period_start) do nothing;

  insert into public.competition_periods(competition,cadence,period_start,period_end,reconcile_at,status,ruleset_version)
  select c,'weekly'::public.competition_cadence,v_week_start,v_week_end,v_week_reconcile,'open'::public.competition_period_status,
    case when c='cardio_bunny'::public.competition_kind then 'v4' else 'v3' end
  from (values ('beast'::public.competition_kind),('eager_beaver'::public.competition_kind),('cardio_bunny'::public.competition_kind),('step_king'::public.competition_kind)) x(c)
  on conflict (competition,cadence,period_start) do nothing;

  for r in select id from public.competition_periods where status <> 'finalized'::public.competition_period_status and reconcile_at <= now() order by reconcile_at loop
    perform public.phatbot_finalize_competition_period(r.id);
  end loop;

  for r in select id from public.competition_periods where status = 'open'::public.competition_period_status and period_start <= now() and reconcile_at > now() order by cadence,competition loop
    perform public.phatbot_rebuild_competition_period(r.id);
  end loop;
end
$function$;
