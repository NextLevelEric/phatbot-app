-- Assisted exercise logging V1
-- Assistance is stored as a positive amount with an explicit method.
-- Existing weight/reps history remains unchanged and assisted sets are excluded
-- from lifting PO/PR/Beast until deterministic like-for-like rules are validated.

alter table public.sets
  add column if not exists load_type text not null default 'external_load',
  add column if not exists assistance_amount numeric(8,2),
  add column if not exists assistance_method text;

alter table public.sets
  add constraint sets_load_type_check
    check (load_type in ('external_load','bodyweight','assisted_bodyweight')),
  add constraint sets_assistance_amount_check
    check (assistance_amount is null or assistance_amount > 0),
  add constraint sets_assistance_shape_check
    check (
      (load_type = 'assisted_bodyweight' and assistance_method is not null and length(trim(assistance_method)) > 0)
      or
      (load_type <> 'assisted_bodyweight' and assistance_amount is null and assistance_method is null)
    );

comment on column public.sets.load_type is 'How resistance is represented. Assisted bodyweight is intentionally separate from external load.';
comment on column public.sets.assistance_amount is 'Optional positive assistance amount when known; never encode assistance as negative weight.';
comment on column public.sets.assistance_method is 'Required descriptor for assisted bodyweight, e.g. machine, band, partner. Amount may be null when unknown.';
