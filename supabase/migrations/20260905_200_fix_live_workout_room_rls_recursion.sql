create or replace function public.is_live_workout_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_workout_room_members m
    where m.room_id = p_room_id
      and m.athlete_user_id = auth.uid()
  );
$$;

revoke all on function public.is_live_workout_room_member(uuid) from public;
grant execute on function public.is_live_workout_room_member(uuid) to authenticated;

drop policy if exists "room members can read rooms" on public.live_workout_rooms;
create policy "room members can read rooms"
on public.live_workout_rooms for select to authenticated
using (host_user_id = auth.uid() or public.is_live_workout_room_member(id));

drop policy if exists "room members can read membership" on public.live_workout_room_members;
create policy "room members can read membership"
on public.live_workout_room_members for select to authenticated
using (
  athlete_user_id = auth.uid()
  or exists (
    select 1 from public.live_workout_rooms r
    where r.id = live_workout_room_members.room_id
      and r.host_user_id = auth.uid()
  )
  or public.is_live_workout_room_member(room_id)
);
