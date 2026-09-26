# Flexible prescribed workout days

## Behavior

Home still recommends the current assignment cursor. On Current Program, an
athlete may choose another day from that assignment's exact published version.
The start RPC atomically reorders only the remaining days in this rotation and
creates the normal immutable program-workout snapshot. A day already passed in
the rotation becomes an extra session; the still-due days remain queued. A
cancelled session does not consume a day. Completion with a logged set consumes
exactly the selected day, then recommends the next queued day. The next cycle
returns to the normal first day. The assignment, future scheduled assignment,
program version, historical comparison identity, and scoring formulas remain
unchanged.

The existing optional-day actions remain available. Skipping an expected
optional day now follows the reordered queue, and the skip label reflects the
actual next day. Out-of-order optional bonus starts retain their original
bonus semantics; the explicit picker moves the selected day into today's
rotation instead.

## Safety and rollout

- Migration: `supabase/migrations/20260926081759_flexible_program_days.sql`.
  It adds one assignment-level queue column and updates only the assignment
  guard, selected-start RPC, optional-skip RPC, completion trigger function,
  and read-only day-options RPC. No existing assignment is reconfigured.
- Execute the reviewed migration in a non-production environment before
  testing the branch preview. Do not connect a preview to production data.
- Deploy the migration to production through the reviewed, single-migration
  workflow **before** publishing the UI. Do not use a broad `supabase db push`:
  this repository has historically had migration-ledger differences.
- Smoke-test with a test athlete: choose an ahead day, cancel once, start and
  complete with a set, confirm the deferred day is next; then finish a cycle.
  Do not alter Sam's live assignment merely to test the feature.
- The iOS wrapper loads the hosted web app, but verify the new selector on a
  real phone before telling Sam it is available. Production deployment and
  Sam's actual workout adjustment are not part of this branch.

## Local verification

`node scripts/test-optional-program-days.mjs` replays the program migration
chain into disposable PGlite and tests ownership, stale revision, cancellation,
optional skip, completion, and cycle wrap. `npm test`, `npm run typecheck`, and
`npm run build` also passed in the development workspace.
