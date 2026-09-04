create extension if not exists pgcrypto;

create table if not exists public.live_workout_rooms (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_id uuid,
  room_name text not null default 'Train Together',
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  status text not null default 'open' check (status in ('open','finished','cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists public.live_workout_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.live_workout_rooms(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  workout_session_id uuid references public.workout_sessions(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique(room_id, athlete_user_id)
);
alter table public.live_workout_rooms enable row level security;
alter table public.live_workout_room_members enable row level security;
create policy "room members can read rooms" on public.live_workout_rooms for select to authenticated using (host_user_id = auth.uid() or exists (select 1 from public.live_workout_room_members m where m.room_id=id and m.athlete_user_id=auth.uid()));
create policy "athletes can create rooms" on public.live_workout_rooms for insert to authenticated with check (host_user_id=auth.uid());
create policy "hosts can update rooms" on public.live_workout_rooms for update to authenticated using (host_user_id=auth.uid()) with check (host_user_id=auth.uid());
create policy "room members can read membership" on public.live_workout_room_members for select to authenticated using (athlete_user_id=auth.uid() or exists (select 1 from public.live_workout_rooms r where r.id=room_id and r.host_user_id=auth.uid()) or exists (select 1 from public.live_workout_room_members me where me.room_id=room_id and me.athlete_user_id=auth.uid()));
create policy "athletes can join rooms" on public.live_workout_room_members for insert to authenticated with check (athlete_user_id=auth.uid());
create policy "athletes can update own room membership" on public.live_workout_room_members for update to authenticated using (athlete_user_id=auth.uid()) with check (athlete_user_id=auth.uid());
create or replace function public.join_live_workout_room(p_join_code text)
returns table(room_id uuid, host_session_id uuid, workout_id uuid, room_name text)
language plpgsql security definer set search_path=public as $$
declare r public.live_workout_rooms%rowtype;
begin
  select * into r from public.live_workout_rooms where join_code=upper(trim(p_join_code)) and status='open';
  if r.id is null then raise exception 'Workout room not found or closed'; end if;
  insert into public.live_workout_room_members(room_id,athlete_user_id) values(r.id,auth.uid()) on conflict(room_id,athlete_user_id) do nothing;
  return query select r.id,r.host_session_id,r.workout_id,r.room_name;
end $$;
grant execute on function public.join_live_workout_room(text) to authenticated;
