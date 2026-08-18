-- Athlete-initiated coach invitations.
-- Phase 1 stores the invitation securely and lets an existing PHATBOT user
-- with the matching email accept it. Email delivery for brand-new coaches
-- will be added after this data/consent flow is verified.

create type public.coach_invitation_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');

create table public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  coach_email text not null,
  status public.coach_invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index coach_invitations_one_pending_per_email
  on public.coach_invitations (athlete_user_id, lower(coach_email))
  where status = 'pending';

create index coach_invitations_email_status_idx
  on public.coach_invitations (lower(coach_email), status, created_at desc);

create trigger coach_invitations_set_updated_at before update on public.coach_invitations
for each row execute function public.set_updated_at();

alter table public.coach_invitations enable row level security;

create policy coach_invitations_athlete_insert on public.coach_invitations
for insert with check (athlete_user_id = auth.uid());

create policy coach_invitations_athlete_read on public.coach_invitations
for select using (athlete_user_id = auth.uid());

create policy coach_invitations_athlete_cancel on public.coach_invitations
for update using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

-- Secure helper: auth.users email is only inspected inside this function.
create or replace function public.my_pending_coach_invitations()
returns table (
  invitation_id uuid,
  athlete_user_id uuid,
  athlete_name text,
  coach_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select ci.id, ci.athlete_user_id, coalesce(p.display_name, 'Athlete'), ci.coach_email, ci.created_at, ci.expires_at
  from public.coach_invitations ci
  join public.profiles p on p.id = ci.athlete_user_id
  join auth.users u on u.id = auth.uid()
  where ci.status = 'pending'
    and ci.expires_at > now()
    and lower(ci.coach_email) = lower(u.email);
$$;

create or replace function public.respond_to_coach_invitation(invitation_id uuid, accept_invitation boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite public.coach_invitations%rowtype;
  current_email text;
begin
  select email into current_email from auth.users where id = auth.uid();
  select * into invite from public.coach_invitations where id = invitation_id for update;

  if invite.id is null or invite.status <> 'pending' or invite.expires_at <= now() then
    return false;
  end if;
  if current_email is null or lower(invite.coach_email) <> lower(current_email) then
    return false;
  end if;

  if accept_invitation then
    insert into public.coach_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    insert into public.coach_athletes (coach_user_id, athlete_user_id, active)
      values (auth.uid(), invite.athlete_user_id, true)
      on conflict (coach_user_id, athlete_user_id) do update set active = true;
    update public.coach_invitations set status = 'accepted', accepted_by = auth.uid() where id = invitation_id;
  else
    update public.coach_invitations set status = 'declined', accepted_by = auth.uid() where id = invitation_id;
  end if;

  return true;
end;
$$;

grant execute on function public.my_pending_coach_invitations() to authenticated;
grant execute on function public.respond_to_coach_invitation(uuid, boolean) to authenticated;
