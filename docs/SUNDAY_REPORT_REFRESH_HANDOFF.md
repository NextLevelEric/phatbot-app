# Sunday Report V1 refresh onto production main

Branch: `codex/sunday-weekly-progress-report-v1`.

This refresh merges production main `eb183e4c057f5001a3fbb665fe41613fb41475b8`
into the published Sunday Report commit `22514644231bdf296999b9a5af8d0d2c81c47560`.
The original common base was `611756877a3e331ef76c6aebf538f071e7049341`.
A merge preserves the published feature history and permits a normal push without
rewriting remote commits. No merge into main is performed.

## Conflict and integration audit

There was exactly one conflict, at the imports in `src/app/page.tsx`:
Sunday Report added `WeeklyReportReadyCard`, while main added
`startStartupAttempt` / `StartupTimeoutError`. Both imports were retained.
No product decision or competing behavior needed resolution.

The entire Home startup effect, loading/error branches, cancellation, timeout,
auth handling, and retry behavior are identical to current main. A source
comparison confirms that removing the weekly-card import and its JSX placement
reproduces main's Home file exactly. Resume remains above the program/next-workout
card, which remains above the secondary weekly card.

The App Store recovery helper/native files and all optional-day production files
are unchanged from main, including AthleteProgramHomeCard, Program Detail,
optional start/skip controls, coach view, and the optional-day migration.

The ready card now uses main's bounded read helper independently of Home startup:
15-second timeout, request cancellation, and ignored late results. Missing schema,
offline errors, or missing configuration hide this optional card rather than
produce an unhandled rejection. It does not finalize reports. The original
72-hour visibility rule is preserved, with a timer to hide the card even if Home
remains mounted beyond that window. This is the only feature runtime adjustment
beyond integrating current main; the report page/calculations were not redesigned.

## Migration ordering

Read-only production inspection found latest recorded migration:
`20260917120103` / `assignment_optional_program_days`.
`public.weekly_progress_reports` was absent. The older pending Sunday filename
would sort before the applied production entry.

Using `supabase migration new sunday_weekly_progress_reports`, the pending file
was replaced:

- Old: `20260916120623_sunday_weekly_progress_reports.sql`
- New: `20260917121148_sunday_weekly_progress_reports.sql`
- New version: `20260917121148`

The SQL content is identical to the reviewed original; only the filename and its
test reference changed. Local byte SHA-256 at replacement:
`9515ba21a86151d87f811df46b84c09b9b7327cb8631f56d759e5b0de2ad1e35`.
A separate comparison against the original Git blob also passed, normalizing
only Windows line endings. The old pending migration file is removed.

The applied optional-day file retains its existing repository name
`20260916210539_assignment_optional_program_days.sql`; production recorded it as
`20260917120103`. Other older local/production timestamp differences also exist.
This refresh does not rename applied migrations, repair production history, or
include unrelated migration reconciliation work. Do not use a broad `db push`.

## Validation

| Check | Result |
| --- | --- |
| Focused weekly/PO/cardio/program/optional/startup tests | 247 passed, 31 files |
| Full Vitest suite, final code | 329 passed, 44 files |
| TypeScript | Passed |
| Production Webpack build | Passed; 38 static pages |
| Optional-program PostgreSQL integration suite | 20 scenarios passed |
| Combined current-program + weekly migration replay | 13 scenarios passed |
| `git diff --check` | Passed |

The build emits the existing duplicate HealthKit registration warning during
prerender. Native code was unchanged; this does not constitute iOS device QA.

`scripts/test-weekly-report-refresh.mjs` replays real relevant initial, set-type,
test-session, health/cardio, bodyweight, competition, program, assignment,
rotation, scheduling, optional-day, and weekly migrations in disposable PGlite.
It uses minimal historical schema fixtures and unused retired-function stubs
already needed by the program replay. Cron registration is stubbed. A fixed
clock exists only inside this disposable database to test finalization before
the first launch Sunday; the reviewed migration SQL is not modified for tests.
This is not a complete Supabase platform/extension replay or concurrent-worker
stress test.

Assertions verify:

- Frozen snapshots reject updates and survive repeated finalization and late
  source changes without recalculation.
- Sunday-to-Sunday Eastern bounds, inclusive start/exclusive end, 167/169-hour
  DST windows, and Sunday 12:30 readiness remain correct.
- Missing exercise or workout PO coverage yields `incomplete` and null values,
  never fabricated zero scores. Baselines stay separately identified.
- Finalized competition hardware keeps its own competition period and is
  separately labeled in `/weekly`; open awards are excluded.
- `/weekly` has no legacy `weekly_scores` write; finalization also preserves
  source/legacy tables.
- Optional skips add nothing to weekly output. Completed optional bonus work
  appears normally without moving the expected Day 1 cursor.
- Weekly migration does not replace any program sequencing function.
- Snapshot RLS, write denial, anonymous denial, idempotency, and cron window.
- The Home ready card does not block startup, ignores late/error results, expires,
  and sits below Resume and Next Workout.

Run either DB script with `PHATBOT_PGLITE_MODULE` set to the file URL of an installed
`@electric-sql/pglite@0.3.14` `dist/index.js`. Both scripts use disposable databases
and require no production connection.

## Rollout recommendation and remaining checks

The refresh is suitable for a **separately approved, controlled rollout**, following
a staging/browser smoke check. Apply only the new Sunday migration through the
reviewed migration workflow, with the current ledger checked again immediately
before approval. Do not replay applied optional/program migrations or use broad
push/repair to mask their historical filename differences. Deploy reviewed web
code after schema, and verify the new report table/RLS and the single
`phatbot-weekly-progress-reports` cron job.

The unchanged V1 finalizer is launch-forward from September 13; the first report
is ready September 20, 2026 at 12:30 Eastern. Snapshots freeze available source
data at first finalization. Incomplete scoring remains explicitly incomplete;
later source changes do not retroactively rebuild that report.

Before production approval, use fixture accounts in an isolated migrated database:
sign in and verify startup retry on a dropped connection; confirm Resume/Next
Workout precede the report card; open a finalized weekly report and verify
incomplete PO and separate hardware; skip optional Day 6, complete it as a bonus,
and verify Day 1 remains next. Check mobile/iOS layout and error recovery. Do not
generate test reports or alter assignments on production for this smoke test.

No production schema/data/configuration changes or production deployment were
performed. No migration was applied to production and no broad database push was
run. Any Git-triggered preview status is reported with the final remote commit;
a preview connected to production cannot display real Sunday snapshots until the
separately approved migration/finalization and is not end-to-end validation.
