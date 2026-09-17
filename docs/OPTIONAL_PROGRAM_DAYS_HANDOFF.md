# Assignment-level optional program days

Branch: `codex/optional-program-days`, based on production `origin/main` at
`e01045b9885dc36bc25a1714211bb41e7cc896c0`. The Sunday Weekly Report branch is excluded.

## Problem and behavior

The existing assignment cursor required every day of an immutable program in
sequence. An athlete could not deliberately pass Day 6 without doing it. The
change keeps the shared six-day definition intact and stores optional choices on
each assignment. All assignments default to an empty override, including Amanda
and Mason. No athlete has been configured in production by this implementation.

`optional_program_day_ids uuid[]` contains day IDs from the exact assigned
version. `program_cursor_revision bigint` invalidates old skip requests, including
a delayed request that arrives after the cursor has completed another full cycle.
Configuration must retain at least one required day and rejects duplicates,
nulls, and days from other versions. Ended assignment options remain historical.

An expected optional day is still next until explicitly completed or skipped.
Skip updates only the assignment cursor, revision, and its existing update
timestamp. It inserts no session, set, score, history, or competition record.
Repeating the same skip is a no-op. Any in-progress workout blocks a current skip.

Optional starts use the same immutable prescriptions and per-assignment/day
comparison workout identity as normal starts. They open the existing session
screen and use its existing completion/scoring flow. Completing expected Day 6
wraps normally. Completing bonus Day 6 after skipping to Day 1 records real work
but does not advance Day 1. Linked completion still requires a logged set;
cancelled, unlinked, custom/cardio, and merely started sessions do not advance.
No PO, competition, reporting, or workout-completion formulas were changed.

## Authorization and scheduling

Only authenticated athletes can start or skip their own active assignment. The
server validates the optional flag; callers cannot supply a new flag or arbitrary
destination. Revision comparison and row locking protect skip replay. Starts and
skips use the existing per-athlete advisory lock. Existing in-progress protections
remain in place. Enrollment client privileges remain SELECT-only.

`phatbot_private.set_assignment_optional_days(uuid, uuid[])` is available only to
trusted server/admin roles. No management UI or athlete-callable configuration
RPC is introduced. `get_program_day_options` permits the athlete or an actively
linked coach to read configuration. Security-definer functions have an empty
search path and explicit execution grants.

Scheduled assignments can be configured in place. Activation preserves their ID,
start time, and options. Rescheduling the same assignment to a different version
clears old-version options; an administrator must deliberately configure the new
version. Options are per assignment and do not automatically carry to a future
replacement assignment.

## Files and UI

- `supabase/migrations/20260916210539_assignment_optional_program_days.sql`:
  schema, guarded admin configuration, read/skip/optional-start RPCs, shared start
  primitive, and revision-aware completion.
- `src/components/OptionalProgramDayActions.tsx` and
  `src/features/programs/optionalDays.ts`: reusable controls and assignment lookup.
- `src/components/AthleteProgramHomeCard.tsx`: optional label, Start Day 6 and Skip
  to Day 1; existing active-workout state remains authoritative.
- `src/app/programs/current/page.tsx`: optional labels, scheduled configuration,
  and optional starts from expanded rotation days even after a skip.
- `src/components/CoachAthleteProgramSection.tsx`: active/scheduled optional-day
  summary, with no configuration editor.
- `src/features/programs/optionalDays.test.tsx` and
  `scripts/test-optional-program-days.mjs`: control/RPC and database coverage.
- `supabase/operations/configure_strength_optional_day_6.sql`: separately
  approved, guarded configuration transaction; defaults to rollback.

## Validation completed

- Disposable PGlite PostgreSQL replay and 20 integration scenarios passed.
  Coverage includes all 15 requested cases, RLS/grants, required-day rejection,
  wrong-owner rejection, replay after a complete rotation, in-progress rejection,
  no-set completion rejection, custom completion, scheduled activation, invalid
  options, historical preservation, and rescheduling to another version.
- Skip snapshots compare workout/session/set/score/PR/weekly-score/competition
  tables before and after, including a seeded competition entry. Immutable
  program tables and the normal control assignment remain unchanged.
- The exact operations script was exercised using disposable fixture IDs:
  rollback changes nothing, commit configures exactly four, repetition is safe,
  and a changed schedule aborts the transaction.
- Full Vitest suite: 40 files, 304 tests passed.
- `npm run typecheck`: passed.
- `npm run build -- --webpack`: passed; 38 static pages generated. Existing
  duplicate HealthKit registration warning appeared during prerender. No native
  code was changed or native runtime behavior claimed as tested.
- `git diff --check`: passed before commit.

The disposable replay uses the real program migration chain and competition
foundation on the initial schema plus minimal historical schema fixtures. It
stubs cron registration and retired, unused legacy enrollment functions absent
from their historical checked-in SQL. It is not a complete Supabase platform
replay, cron execution test, concurrent multi-connection stress test, or an
end-to-end scoring-service/device test. Actual scoring algorithms are covered by
the existing full suite; optional sessions use the unchanged standard path.

To rerun the DB test, install `@electric-sql/pglite@0.3.14` in a disposable tools
directory, set `PHATBOT_PGLITE_MODULE` to the file URL of its `dist/index.js`, then
run `node scripts/test-optional-program-days.mjs` from this worktree. The script
has no network or production connection.

## Production rollout — NOT executed; separate approval required

No production schema/configuration writes, deployments, merge, or athlete
impersonation occurred. Production inspection used read-only table queries.
No remote preview was deployed: the connected database does not yet expose the
new RPCs, and the target assignments are scheduled. A real interactive preview
requires an isolated database with the new migration and active fixture athletes;
the production athletes should not be activated or changed to create a preview.

1. After separate approval, confirm the target is production project
   `fwcokqxhqrivrjazmoyd` and that the preceding program/rotation/scheduling
   migrations are already present. Use the normal backup/recovery procedure.
   Inspect migration history first: local historical migration reconciliation is
   separate work and is not part of this branch. Do not blindly push all locally
   pending historical files.
2. Apply **only** `20260916210539_assignment_optional_program_days.sql` through
   the controlled Supabase migration workflow, recording version `20260916210539`.
   Apply schema before deploying the UI. The migration configures no athlete and
   leaves every existing optional array empty. Verify the new RPCs/grants and
   that the immutable published version still has six days.
3. Deploy the reviewed web commit only after its separate approval. Verify normal
   program start behavior and coach/program reads. No native resubmission is
   required solely for these remotely hosted web controls.
4. Review `supabase/operations/configure_strength_optional_day_6.sql`. With separate
   approval, execute it through a trusted admin database connection. Its default
   `ROLLBACK` is a dry run (still requires approval to execute on production).
   Inspect the six returned rows, then execute the same transaction with its
   final `ROLLBACK` changed to `COMMIT` for the approved configuration. If any
   guard fails, stop and review the changed assignment; do not relax guards.

The four exact targets are:

| Athlete | Existing scheduled assignment |
| --- | --- |
| Zach Green / zgreen | `e558ca4b-aa2b-4c86-9713-3a60f9265aa2` |
| Steven Kottwitz Jr. / Stevenkottwitzjr | `9d54cb05-f659-4532-a5a5-b822d76bd0f5` |
| Sam Mayfield / mayfield.samuel93 | `d6c3d36a-c839-4796-b3f3-e494f71ae3a7` |
| Chris / imels138 | `6dc06525-4624-43fc-909d-1f8606b191ec` |

For each, the operation sets only Day 6
`56c31f74-6b8c-4edd-a61c-8c92be8e3228` optional on version
`56fe6b12-a354-4c8e-bf82-d0e9bcf414c2`. It verifies the exact athlete UUID,
scheduled status, start `2026-09-21T04:00:00Z` (September 21, midnight New York),
and Day 1 cursor `c147a358-3af0-4a92-a921-b712aa512314`. It does not cancel or
recreate any assignment. It snapshots and verifies Amanda's
`0e1d335e-02e3-4969-96e7-f27a36346f6e` and Mason's
`9fedb561-2243-4d25-bf7b-e4dd76de68c0` unchanged with empty overrides.

The final SELECT in the operations file is also the read-only post-commit check:
four singleton Day 6 arrays, two empty arrays, unchanged IDs/start dates/Day 1
cursors. The committed transaction can safely repeat. After activation the
scheduled-only guard intentionally fails; prepare a fresh reviewed operation
against then-current assignment state instead.

## Remaining manual validation

Use isolated staging athletes, not the six production athletes, for these tests:

1. Apply migration and create one normal and one optional six-day fixture
   assignment. On an iPhone-sized browser and iOS shell, complete fixture Day 5
   with a logged set. Check Home shows Day 6 required for the normal athlete and
   optional with both actions for the optional athlete.
2. Skip optional Day 6. Confirm Home reloads to Day 1 and history, scores, and
   competition data are unchanged. Replay from a stale second tab; confirm it
   does not move beyond Day 1. Repeat after a whole cycle to Day 6.
3. Open Program Detail, expand optional Day 6, start it, log a set, and finish.
   Confirm the standard session/report/scoring output includes the work, while
   Home remains on Day 1. Complete Day 1 and verify Day 2 follows.
4. Start an expected Day 6 and finish to confirm normal wrap. Try skipping or
   starting another optional workout while a session is open; confirm rejection
   and ability to resume from Home. Test offline response loss and refresh.
5. Verify coach scheduled labels, fixture scheduled activation, and a normal
   athlete's unchanged six-day controls. Check mobile tap targets and scrolling.

Rollout order and real browser/device testing remain the material follow-ups.
Neither production enablement nor full native/remote end-to-end validation is
claimed by the automated results above.
