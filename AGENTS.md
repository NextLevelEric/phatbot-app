# PHATBOT Codex Project Instructions

PHATBOT is a production fitness performance tracking application currently in active beta/Early Access development.

Treat this as a real production application with existing users and persisted workout history. Reliability and data integrity take priority over speed or architectural experimentation.

## Connected services

- GitHub repository: `NextLevelEric/phatbot-app`
- Default branch: `main`
- Production Supabase project: `fwcokqxhqrivrjazmoyd` (`NextLevelEric's Project`)
- Treat the connected Supabase project as production. Prefer read-only inspection. Do not apply migrations, execute mutating SQL, deploy functions, or change project configuration unless the task explicitly requires it and the change has been reviewed for data safety.
- Never put Supabase service-role or other secret credentials in tracked files or browser-exposed environment variables.

## Development principles

- Inspect the existing implementation before changing code.
- Preserve working architecture unless a change is genuinely necessary.
- Prefer the smallest reliable fix over broad refactors.
- Do not rewrite functioning systems merely to make them cleaner.
- Do not introduce new dependencies unless there is a clear benefit.
- Follow established Next.js, TypeScript, React, Supabase, and iOS-wrapper patterns already present in the repository.
- Maintain responsive/mobile-first behavior, with particular attention to iPhone safe areas and native-shell behavior.

## Workout data is critical

PHATBOT stores real athlete workout history. Never silently overwrite, delete, renumber, duplicate, or corrupt historical workout data.

Be especially cautious when modifying:

- workout sessions
- exercise sessions
- sets
- workout history
- progressive-overload calculations
- PR calculations
- reports
- leaderboard/Beast calculations

Mutations should be deterministic and protected against accidental duplicate submissions where appropriate.

Do not automatically retry non-idempotent mutations unless duplicate execution is impossible.

## PHATBOT scoring

Progressive overload, PR detection, report calculations, and future Beast/leaderboard calculations are deterministic product logic.

Do not change scoring rules as part of unrelated fixes.

If a requested change appears to alter existing scoring behavior, identify that explicitly before implementing it.

## Debugging

When fixing a bug:

1. Reproduce or identify the failure path.
2. Determine the root cause rather than masking the symptom.
3. Make the smallest reliable correction.
4. Add or update regression coverage when practical.
5. Run relevant tests, lint/type checks, and builds.
6. Check for unintended effects on adjacent workout flows.

Never claim a bug is fixed solely because the code compiles.

## UX

PHATBOT should feel simple while an athlete is actively training.

Optimize important workout interactions for one-handed mobile use, clear hierarchy, low cognitive load, and minimal interruption between sets.

Distinguish clearly between:

- editing a workout template
- performing a live workout
- reviewing completed workout history

Avoid exposing raw technical errors to athletes. Errors should explain what happened, whether their data is safe, and what they should do next.

## Scope discipline

PHATBOT is moving toward public Early Access.

Priority order:

1. Data-loss/data-integrity defects
2. Authentication and workout-blocking failures
3. Misleading scoring or performance data
4. Leaderboards / Beast recognition system
5. Athlete profiles and achievements
6. Social sharing
7. Non-blocking UX polish

Do not turn a narrow bug fix into an unrelated feature or refactor.

## Before completing a task

Report:

- root cause
- files changed
- behavior changed
- tests/checks performed
- results
- migrations/environment changes, if any
- remaining manual testing required
- any risks or follow-up work

If a change cannot be adequately verified automatically, say so explicitly and give the exact manual test procedure.

Never fabricate test results.
