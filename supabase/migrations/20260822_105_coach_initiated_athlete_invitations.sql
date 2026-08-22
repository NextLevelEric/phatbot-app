-- Coach-initiated athlete onboarding.
-- Supports inviting an existing PHATBOT account by email and a pending invite
-- for a new account that can be claimed after signup with the same email.

create table if not exists public.athlete_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references public.coach_profiles(user_id) on delete cascade,
  athlete_email text not null,
  athlete_name text,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists athlete_invitations_one_pending_per_email
  on public.athlete_invitations (coach_user_id, lower(athlete_email)) where status = 'pending';
create index if not exists athlete_invitations_email_status_idx
  on public.athlete_invitations (lower(athlete_email), status, created_at desc);

alter table public.athlete_invitations enable row level security;

create policy athlete_invitations_coach_read on public.athlete_invitations
for select using (coach_user_id = auth.uid());

create or replace function public.invite_athlete_by_email(p_athlete_email text, p_athlete_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(trim(p_athlete_email));
  existing_user uuid;
  invite_id uuid;
begin
  if not exists (select 1 from public.coach_profiles where user_id = auth.uid()) then
    raise exception 'Coach mode is required.';
  end if;
  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'Enter a valid athlete email.';
  end if;

  select id into existing_user from auth.users where lower(email) = normalized_email limit 1;
  if existing_user is not null then
    insert into public.athlete_profiles (user_id) values (existing_user) on conflict (user_id) do nothing;
    insert into public.coach_athletes (coach_user_id, athlete_user_id, active)
      values (auth.uid(), existing_user, true)
      on conflict (coach_user_id, athlete_user_id) do update set active = true;
    return jsonb_build_object('status','linked','athlete_user_id',existing_user);
  end if;

  insert into public.athlete_invitations (coach_user_id, athlete_email, athlete_name)
  values (auth.uid(), normalized_email, nullif(trim(coalesce(p_athlete_name,'')),''))
  on conflict (coach_user_id, lower(athlete_email)) where status = 'pending'
  do update set athlete_name = excluded.athlete_name, expires_at = now() + interval '14 days', updated_at = now()
  returning id into invite_id;
  return jsonb_build_object('status','pending','invitation_id',invite_id);
end;
$$;

create or replace function public.claim_my_athlete_invitations()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_email text;
  claimed integer := 0;
begin
  select lower(email) into current_email from auth.users where id = auth.uid();
  if current_email is null then return 0; end if;
  insert into public.athlete_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  insert into public.coach_athletes (coach_user_id, athlete_user_id, active)
    select ai.coach_user_id, auth.uid(), true
    from public.athlete_invitations ai
    where ai.status = 'pending' and ai.expires_at > now() and lower(ai.athlete_email) = current_email
    on conflict (coach_user_id, athlete_user_id) do update set active = true;
  get diagnostics claimed = row_count;
  update public.athlete_invitations set status='accepted', accepted_by=auth.uid(), updated_at=now()
    where status='pending' and expires_at > now() and lower(athlete_email)=current_email;
  return claimed;
end;
$$;

grant execute on function public.invite_athlete_by_email(text,text) to authenticated;
grant execute on function public.claim_my_athlete_invitations() to authenticated;
