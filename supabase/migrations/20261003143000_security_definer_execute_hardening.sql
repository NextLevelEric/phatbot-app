-- Tighten EXECUTE privileges on SECURITY DEFINER functions exposed through PostgREST.
-- Keep authenticated access only where the application or RLS intentionally needs it.
-- Trigger-only functions should not be directly executable by client roles.

revoke execute on function public.add_eric_as_my_coach() from public, anon;
revoke execute on function public.backfill_athlete_training_intelligence(uuid,jsonb,jsonb,jsonb) from public, anon;
revoke execute on function public.can_access_athlete(uuid) from public, anon;
revoke execute on function public.cancel_coach_invitation(uuid) from public, anon;
revoke execute on function public.claim_my_athlete_invitations() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_coach_dashboard_access(uuid) from public, anon;
revoke execute on function public.import_coach_workout_history(uuid,jsonb) from public, anon;
revoke execute on function public.import_coach_workout_templates(uuid,jsonb) from public, anon;
revoke execute on function public.invite_athlete_by_email(text,text) from public, anon;
revoke execute on function public.is_live_workout_room_member(uuid) from public, anon;
revoke execute on function public.join_live_workout_room_and_start(text) from public, anon;
revoke execute on function public.join_live_workout_room(text) from public, anon;
revoke execute on function public.link_existing_history_when_workout_saved() from public, anon, authenticated;
revoke execute on function public.link_workout_session_to_template() from public, anon, authenticated;
revoke execute on function public.mark_coach_feedback_read(uuid) from public, anon;
revoke execute on function public.my_pending_coach_invitations() from public, anon;
revoke execute on function public.respond_to_coach_invitation(uuid,boolean) from public, anon;

-- Preserve explicit intended access after removing PUBLIC inheritance.
grant execute on function public.add_eric_as_my_coach() to authenticated, service_role;
grant execute on function public.backfill_athlete_training_intelligence(uuid,jsonb,jsonb,jsonb) to authenticated, service_role;
grant execute on function public.can_access_athlete(uuid) to authenticated, service_role;
grant execute on function public.cancel_coach_invitation(uuid) to authenticated, service_role;
grant execute on function public.claim_my_athlete_invitations() to authenticated, service_role;
grant execute on function public.has_coach_dashboard_access(uuid) to authenticated, service_role;
grant execute on function public.import_coach_workout_history(uuid,jsonb) to authenticated, service_role;
grant execute on function public.import_coach_workout_templates(uuid,jsonb) to authenticated, service_role;
grant execute on function public.invite_athlete_by_email(text,text) to authenticated, service_role;
grant execute on function public.is_live_workout_room_member(uuid) to authenticated, service_role;
grant execute on function public.join_live_workout_room_and_start(text) to authenticated, service_role;
grant execute on function public.join_live_workout_room(text) to authenticated, service_role;
grant execute on function public.mark_coach_feedback_read(uuid) to authenticated, service_role;
grant execute on function public.my_pending_coach_invitations() to authenticated, service_role;
grant execute on function public.respond_to_coach_invitation(uuid,boolean) to authenticated, service_role;
