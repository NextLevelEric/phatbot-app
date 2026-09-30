create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.phatbot_refresh_open_competitions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('phatbot_refresh_open_competitions')) then
    return;
  end if;

  for r in
    select id
    from public.competition_periods
    where status = 'open'::public.competition_period_status
      and period_start <= now()
      and reconcile_at > now()
    order by cadence, competition
  loop
    perform public.phatbot_rebuild_competition_period(r.id);
  end loop;
end
$$;

revoke all on function private.phatbot_refresh_open_competitions() from public, anon;
grant execute on function private.phatbot_refresh_open_competitions() to authenticated, service_role;

create or replace function public.refresh_competition_standings_after_health_sync()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  perform private.phatbot_refresh_open_competitions();
end
$$;

revoke all on function public.refresh_competition_standings_after_health_sync() from public, anon;
grant execute on function public.refresh_competition_standings_after_health_sync() to authenticated, service_role;
