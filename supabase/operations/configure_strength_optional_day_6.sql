-- NOT RUN. Requires separate production migration/configuration approval.
-- Run with a trusted database administrator connection, never an athlete client.
-- Default ROLLBACK makes this a reviewable dry run. After approval, change only
-- the final ROLLBACK to COMMIT for the controlled configuration transaction.
-- Refuses to configure if assignments have changed or already activated.
begin;

do $$
declare
  target record;
  assignment public.athlete_program_enrollments%rowtype;
  version_id constant uuid := '56fe6b12-a354-4c8e-bf82-d0e9bcf414c2';
  day_one constant uuid := 'c147a358-3af0-4a92-a921-b712aa512314';
  day_six constant uuid := '56c31f74-6b8c-4edd-a61c-8c92be8e3228';
  normal_before jsonb;
  normal_after jsonb;
begin
  if not exists (
    select 1 from public.training_programs p
    join public.training_program_days d on d.program_id = p.id
    where p.id = version_id and p.status = 'published' and d.id = day_six and d.day_number = 6
  ) or (select count(*) from public.training_program_days where program_id = version_id) <> 6 then
    raise exception 'Expected immutable published six-day version not found';
  end if;

  select jsonb_agg(to_jsonb(a) order by a.id) into normal_before
  from public.athlete_program_enrollments a
  where a.id in ('0e1d335e-02e3-4969-96e7-f27a36346f6e', '9fedb561-2243-4d25-bf7b-e4dd76de68c0');
  if jsonb_array_length(normal_before) is distinct from 2 or exists (
    select 1 from public.athlete_program_enrollments a
    where a.id in ('0e1d335e-02e3-4969-96e7-f27a36346f6e', '9fedb561-2243-4d25-bf7b-e4dd76de68c0')
      and (a.program_id <> version_id or cardinality(a.optional_program_day_ids) <> 0)
  ) then raise exception 'Amanda/Mason baseline changed; review before proceeding'; end if;

  for target in select * from (values
    ('Zach Green', 'c741a36c-18d0-4083-a8ad-bb6fa9f4df6a'::uuid, 'e558ca4b-aa2b-4c86-9713-3a60f9265aa2'::uuid),
    ('Steven Kottwitz Jr.', 'b913f426-6d63-4985-bc57-cd7b74b08351'::uuid, '9d54cb05-f659-4532-a5a5-b822d76bd0f5'::uuid),
    ('Sam Mayfield', '3a51aead-c22b-4f7b-8560-0b3746eef2e1'::uuid, 'd6c3d36a-c839-4796-b3f3-e494f71ae3a7'::uuid),
    ('Chris / imels138', 'd2ca0b20-297c-4f22-891a-d01129dacb1b'::uuid, '6dc06525-4624-43fc-909d-1f8606b191ec'::uuid)
  ) as expected(name, athlete_id, assignment_id) order by athlete_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(1346912596, pg_catalog.hashtext(target.athlete_id::text));
    select * into assignment from public.athlete_program_enrollments where id = target.assignment_id for update;
    if assignment.id is null
      or assignment.athlete_user_id <> target.athlete_id
      or assignment.program_id <> version_id
      or assignment.status <> 'scheduled'
      or assignment.started_at <> '2026-09-21T04:00:00Z'::timestamptz
      or assignment.next_program_day_id <> day_one
      or not (assignment.optional_program_day_ids = '{}'::uuid[] or assignment.optional_program_day_ids = array[day_six])
    then raise exception 'Scheduled assignment changed for %; no configuration applied', target.name; end if;

    perform phatbot_private.set_assignment_optional_days(target.assignment_id, array[day_six]);
  end loop;

  select jsonb_agg(to_jsonb(a) order by a.id) into normal_after
  from public.athlete_program_enrollments a
  where a.id in ('0e1d335e-02e3-4969-96e7-f27a36346f6e', '9fedb561-2243-4d25-bf7b-e4dd76de68c0');
  if normal_after is distinct from normal_before then raise exception 'Normal assignments changed'; end if;
end
$$;

select id, athlete_user_id, status, started_at, program_id, next_program_day_id,
  optional_program_day_ids, program_cursor_revision
from public.athlete_program_enrollments
where id in (
  'e558ca4b-aa2b-4c86-9713-3a60f9265aa2', '9d54cb05-f659-4532-a5a5-b822d76bd0f5',
  'd6c3d36a-c839-4796-b3f3-e494f71ae3a7', '6dc06525-4624-43fc-909d-1f8606b191ec',
  '0e1d335e-02e3-4969-96e7-f27a36346f6e', '9fedb561-2243-4d25-bf7b-e4dd76de68c0'
)
order by id;

rollback;
