-- PHATBOT authorization hardening.
-- Principle: athletes own their training data; active linked coaches may read it.
-- Coach writes should happen only through narrowly-scoped features/RPCs such as feedback
-- and invitation acceptance, not through broad FOR ALL access to athlete history.

-- Remove broad policies that allowed an active coach to mutate athlete-owned records.
drop policy if exists workouts_access on public.workouts;
drop policy if exists workout_exercises_access on public.workout_exercises;
drop policy if exists workout_sessions_access on public.workout_sessions;
drop policy if exists exercise_sessions_access on public.exercise_sessions;
drop policy if exists sets_access on public.sets;
drop policy if exists exercise_scores_access on public.exercise_scores;
drop policy if exists workout_scores_access on public.workout_scores;
drop policy if exists personal_records_access on public.personal_records;
drop policy if exists weekly_scores_access on public.weekly_scores;

-- A coach must not be able to create an athlete link merely by knowing an athlete UUID.
-- Accepted invitations use the security-definer respond_to_coach_invitation() function.
drop policy if exists coach_athletes_manage_own on public.coach_athletes;

-- WORKOUT TEMPLATES
create policy workouts_read_permitted on public.workouts
for select using (public.can_access_athlete(athlete_user_id));
create policy workouts_insert_own on public.workouts
for insert with check (athlete_user_id = auth.uid());
create policy workouts_update_own on public.workouts
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy workouts_delete_own on public.workouts
for delete using (athlete_user_id = auth.uid());

create policy workout_exercises_read_permitted on public.workout_exercises
for select using (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and public.can_access_athlete(w.athlete_user_id)
  )
);
create policy workout_exercises_insert_own on public.workout_exercises
for insert with check (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.athlete_user_id = auth.uid()
  )
);
create policy workout_exercises_update_own on public.workout_exercises
for update using (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.athlete_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.athlete_user_id = auth.uid()
  )
);
create policy workout_exercises_delete_own on public.workout_exercises
for delete using (
  exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.athlete_user_id = auth.uid()
  )
);

-- WORKOUT HISTORY
create policy workout_sessions_read_permitted on public.workout_sessions
for select using (public.can_access_athlete(athlete_user_id));
create policy workout_sessions_insert_own on public.workout_sessions
for insert with check (athlete_user_id = auth.uid());
create policy workout_sessions_update_own on public.workout_sessions
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy workout_sessions_delete_own on public.workout_sessions
for delete using (athlete_user_id = auth.uid());

create policy exercise_sessions_read_permitted on public.exercise_sessions
for select using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
);
create policy exercise_sessions_insert_own on public.exercise_sessions
for insert with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and ws.athlete_user_id = auth.uid()
  )
);
create policy exercise_sessions_update_own on public.exercise_sessions
for update using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and ws.athlete_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and ws.athlete_user_id = auth.uid()
  )
);
create policy exercise_sessions_delete_own on public.exercise_sessions
for delete using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_session_id and ws.athlete_user_id = auth.uid()
  )
);

create policy sets_read_permitted on public.sets
for select using (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and public.can_access_athlete(ws.athlete_user_id)
  )
);
create policy sets_insert_own on public.sets
for insert with check (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and ws.athlete_user_id = auth.uid()
  )
);
create policy sets_update_own on public.sets
for update using (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and ws.athlete_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and ws.athlete_user_id = auth.uid()
  )
);
create policy sets_delete_own on public.sets
for delete using (
  exists (
    select 1
    from public.exercise_sessions es
    join public.workout_sessions ws on ws.id = es.workout_session_id
    where es.id = exercise_session_id and ws.athlete_user_id = auth.uid()
  )
);

-- DERIVED PERFORMANCE DATA
create policy exercise_scores_read_permitted on public.exercise_scores
for select using (public.can_access_athlete(athlete_user_id));
create policy exercise_scores_insert_own on public.exercise_scores
for insert with check (athlete_user_id = auth.uid());
create policy exercise_scores_update_own on public.exercise_scores
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy exercise_scores_delete_own on public.exercise_scores
for delete using (athlete_user_id = auth.uid());

create policy workout_scores_read_permitted on public.workout_scores
for select using (public.can_access_athlete(athlete_user_id));
create policy workout_scores_insert_own on public.workout_scores
for insert with check (athlete_user_id = auth.uid());
create policy workout_scores_update_own on public.workout_scores
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy workout_scores_delete_own on public.workout_scores
for delete using (athlete_user_id = auth.uid());

create policy personal_records_read_permitted on public.personal_records
for select using (public.can_access_athlete(athlete_user_id));
create policy personal_records_insert_own on public.personal_records
for insert with check (athlete_user_id = auth.uid());
create policy personal_records_update_own on public.personal_records
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy personal_records_delete_own on public.personal_records
for delete using (athlete_user_id = auth.uid());

create policy weekly_scores_read_permitted on public.weekly_scores
for select using (public.can_access_athlete(athlete_user_id));
create policy weekly_scores_insert_own on public.weekly_scores
for insert with check (athlete_user_id = auth.uid());
create policy weekly_scores_update_own on public.weekly_scores
for update using (athlete_user_id = auth.uid()) with check (athlete_user_id = auth.uid());
create policy weekly_scores_delete_own on public.weekly_scores
for delete using (athlete_user_id = auth.uid());

-- Feedback updates must stay attached to the same coach/athlete relationship and a
-- completed workout owned by that athlete.
drop policy if exists "coaches can update their feedback" on public.coach_workout_feedback;
create policy "coaches can update their feedback"
on public.coach_workout_feedback for update
to authenticated
using (coach_user_id = auth.uid())
with check (
  coach_user_id = auth.uid()
  and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_user_id = auth.uid()
      and ca.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ca.active = true
  )
  and exists (
    select 1 from public.workout_sessions ws
    where ws.id = coach_workout_feedback.workout_session_id
      and ws.athlete_user_id = coach_workout_feedback.athlete_user_id
      and ws.status = 'completed'
  )
);

-- Direct athlete invitation updates were overly broad. Replace them with a narrow
-- cancel RPC so an athlete cannot rewrite coach_email, accepted_by, or arbitrary status.
drop policy if exists coach_invitations_athlete_cancel on public.coach_invitations;

create or replace function public.cancel_coach_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_invitations
  set status = 'cancelled'
  where id = p_invitation_id
    and athlete_user_id = auth.uid()
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.cancel_coach_invitation(uuid) from public;
grant execute on function public.cancel_coach_invitation(uuid) to authenticated;
