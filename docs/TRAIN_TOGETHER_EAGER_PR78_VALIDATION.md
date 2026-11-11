# PR #78: Train Together Eager Beaver release validation

Validated against main `b39053132a607b00b097d1545b963f41a6565c77` on November 11, 2026.

The production function declares `athlete_user_id`, `athlete_name`, `workout_session_id`, and `session_status` as output variables and also uses those names unqualified in its final CTE query. PostgreSQL raises ambiguous-column error 42702. Both callers previously discarded RPC errors and rendered empty standings.

The existing migration adds `#variable_conflict use_column`. The executable regression compares the pre-fix main function body with the correction, ignoring whitespace and that directive, to protect all existing logic, including Beast. Eager remains `(progressions + neutral * 0.5 + 2) / (opportunities + 4) * 100`, rounded to two decimals. Global competition scores and award issuance are untouched.

## Changes and automated verification

- Existing migration: `supabase/migrations/20261008080000_fix_train_together_eager_ambiguous_columns.sql`; no additional migration was needed.
- `TrainTogetherCard`, `TrainTogetherReportCard`, `TrainTogetherCompetitionBoard`, and `trainTogetherStandings`: separate RPC failure states, actionable athlete-safe copy, retry, transport rejection handling, and suppression of final-winner banners when standings fail.
- Local SQL fixture and Vitest regression: execute the exact main function and reproduce ambiguity, then execute the corrected function. Synthetic PostgreSQL tables only; no connection to production. A pinned development-only PGlite dependency makes this repeatable in `npm test`.
- Active: 75.00 with provisional label; completed: 68.75 with final label; regression/neutral mix: 41.67; baseline results excluded from opportunities; zero opportunities have null score/rank; paused athletes excluded and restored on resume; multi-athlete ranks/ties, cross-athlete score filtering, and room isolation verified.
- SQL execution verifies authenticated member access, host access without membership, outsider rejection, missing-user rejection, unsupported competition rejection, anonymous EXECUTE denial, and preservation of function ACLs through replacement.
- Read-only production catalog inspection confirms the original ambiguous function remains installed, `SECURITY DEFINER`, `search_path=public`, EXECUTE restricted to postgres/authenticated/service_role, and host/member authorization in its body. No production function call, DDL, migration, or data mutation was performed.
- `npm test`: 68 files / 476 tests passed, including local SQL execution and error-display/recovery regressions.
- `npm run typecheck`: passed.
- `npm run build`: passed, all 42 static pages generated. Next.js-generated edits to tsconfig and next-env were excluded from the PR.
- `git diff --check`: passed.
- `npm run lint`: blocked by existing `next lint` script; installed Next.js treats `lint` as a directory. No working ESLint config is provided. This is not a passing lint result.
- `npm audit --omit=dev`: five existing production dependency advisories (three high, two critical). No runtime dependency versions changed. Dependency remediation belongs in a separate reviewed change.

## Migration and release requirements

The migration only replaces the existing function, preserving its signature, security mode, search path, ACLs, formula, pause behavior, and Beast branch. It does not update persisted workout history or awards. Apply it only through the reviewed migration process after merge approval. Its October 8 timestamp predates later migrations already on main; verify migration history and choose the single reviewed pending migration rather than blindly pushing all pending migrations, particularly during migration reconciliation. No environment changes or new secrets are required. The local test dependency is not shipped as a runtime dependency.

No merge or deployment has been performed. The scoped correction is suitable for merge review; release sign-off still needs the device/API smoke test below, a deliberate migration application, and an explicit decision about the existing dependency advisories.

## Required manual smoke test

Use staging with two signed-in athlete accounts on separate mobile devices (include an iPhone/native shell):

1. Apply only the reviewed correction in staging. Host a Train Together room and join with the second athlete. Complete comparable exercises with known progression/neutral results. Verify distinct provisional scores on both devices and refreshed ranks within the existing polling interval.
2. Pause one athlete: they disappear from the room standings. Resume: they return with their prior evidence intact. An athlete with no comparable exercise stays unranked rather than receiving a zero score.
3. Finish one workout while the other remains active: its label becomes final while the other remains provisional. Finish both and open both session reports; verify final rows and winner messaging, with no official awards issued by this flow.
4. Force a standings RPC database error or block its network request in staging. Verify the affected board shows the saved-data reassurance and Retry standings button, with no empty-board instruction or final-winner banner. Restore the request and retry in both live and report views; standings recover. Verify one failed competition does not hide the other successful board.
5. Call the staging RPC over the actual Supabase API as a room member, an unrelated authenticated account, and an anonymous client. Verify member success and denial for the others. Expire the member's session and verify actionable failure followed by recovery after signing in again.

Local fixtures do not exercise PostgREST/JWT transport, production migration tooling, or native mobile interaction. The manual procedure is required to cover those boundaries.
