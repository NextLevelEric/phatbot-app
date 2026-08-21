-- Persist athlete PHATBOT signal read state across browsers, devices, and sessions.
create table if not exists public.athlete_signal_reads (
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  signal_kind text not null check (signal_kind in ('win', 'training')),
  signal_key text not null,
  read_at timestamptz not null default now(),
  primary key (athlete_user_id, signal_kind, signal_key)
);

alter table public.athlete_signal_reads enable row level security;

drop policy if exists "Athletes can read own signal state" on public.athlete_signal_reads;
create policy "Athletes can read own signal state"
on public.athlete_signal_reads
for select
to authenticated
using (athlete_user_id = auth.uid());

drop policy if exists "Athletes can mark own signals read" on public.athlete_signal_reads;
create policy "Athletes can mark own signals read"
on public.athlete_signal_reads
for insert
to authenticated
with check (athlete_user_id = auth.uid());

drop policy if exists "Athletes can update own signal state" on public.athlete_signal_reads;
create policy "Athletes can update own signal state"
on public.athlete_signal_reads
for update
to authenticated
using (athlete_user_id = auth.uid())
with check (athlete_user_id = auth.uid());

create index if not exists athlete_signal_reads_user_read_idx
on public.athlete_signal_reads (athlete_user_id, read_at desc);
