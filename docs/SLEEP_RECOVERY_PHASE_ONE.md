# Sleep & Recovery Intelligence — Phase 1

## Problem and scope

The native iOS bridge already returns HealthKit sleep categories and interval timestamps. The shared web sync previously summed every sample duration by end date, including overlapping in-bed, asleep, and stage samples. That could inflate daily sleep. Android currently emits whole sleep-session spans as category 1; these are not evidence of actual asleep time.

This change adds interval-derived nightly records and `/progress/sleep`, linked from Progress. Home, competition scoring, workout scoring, cardio reports, and native code are unchanged. Opening the dashboard only reads data. No proprietary score or medical recommendation is introduced.

## Aggregation, provenance, and missingness

- Version 1 uses timestamp durations, not supplied sample duration totals. Exact category/start/end duplicates are removed; all remaining input intervals are retained with provider, sync-device IANA timezone, snapshot window and observation timestamp.
- HealthKit categories: 0 in bed, 1 asleep unspecified, 2 awake, 3 core, 4 deep, 5 REM. [Apple documents overlapping in-bed and detailed sleep samples](https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis). In-bed and recorded awake durations are independent interval unions; neither is added to sleep. Recorded awake is not a claim about all time awake.
- Sweep unique interval boundaries and union accepted asleep intervals. Overlapping generic asleep and one specific stage count once under that stage. Multiple conflicting specific stages count once as unspecified. Awake/asleep conflicts are excluded from asleep. Conflicts are flagged and excluded from baselines/associations.
- Intervals separated by at most three hours form one episode. Gaps contribute no sleep. This is an explicit heuristic, not a physiological definition; shift work and fragmented sleep may need later refinement.
- Choose the longest actual-sleep episode per local wake date; tie goes to the earlier start. Other episodes remain in raw input and have separately disclosed additional duration. Multiple-episode days are excluded from analysis, avoiding silently adding naps.
- Missing sleep/stages remain null/absent. Android session-only spans remain unknown, not time asleep or time in bed. No source-provided sleep score is currently available.
- Invalid/reversed/>24-hour intervals are omitted and flag retained observations. Unknown categories and >24-hour clusters are flagged. Episodes touching the snapshot boundary are not persisted, so known complete history is not replaced by an explicitly cut episode. A native read can still be incomplete without reporting this; version 1 cannot establish completeness beyond the received intervals.
- Sleep start and wake time mean first accepted asleep start and last accepted asleep end, not measured bed entry or exact physiological waking.
- Timezone comes from the device at sync, not each historical sample. Travel can change historical local-date attribution; no travel correction is inferred. The bridge does not expose per-sample source app/device/UUID, so cross-device priority cannot be recovered; provider-level provenance and received intervals are retained.

The existing daily sleep total is corrected only for dates with newly observed complete episodes. Ambiguous or session-only dates become null rather than inflated totals. Missing sleep reads preserve prior daily values. Legacy totals are never used by the new dashboard, and there is no broad historical backfill. A repeat sync upserts the same athlete/provider/wake-date key. Recent observations can be refreshed; these are not immutable report snapshots.

## Sleep → training → performance

Read up to 120 days with owner-scoped, deterministic pagination. Absolute interval-end bounds avoid excluding local dates east of UTC. Completed non-test strength and canonical cardio remain separate sources of training evidence. Failed auxiliary reads produce warnings, not zero performance or inferred missed workouts.

A following session must start at or after the last asleep interval, on that local wake date, and before the next received asleep interval (including naps). Overnight training after the next local midnight is conservatively not paired. Training completed in the 24 hours before sleep is available as context, including whole-run distance, duration, pace and HR from the existing cardio model. This does not infer workload disrupted sleep.

Strength uses the existing PO score and progression/regression counts. Missing coverage is unknown. Association groups require an existing score, positive scored-exercise count, no baseline outcomes, and match template ID plus scored-exercise count. Changed exercise composition, workload, and effort are not controlled. Cardio groups match provider, activity/segment identity and whole-activity context: parent distance >108% of segment distance is labeled inside a longer activity. Embedded segments and standalone efforts are not pooled. These are analytical groups; scoring/progression rules are unchanged.

## Descriptive analysis

Only positive, unflagged nights with known start/end enter analysis. Group sleep by provider and timezone as well as training identity. Repeated same-signal sessions on one wake date are averaged into one observation so they cannot inflate sample size.

- Need at least 18 matched days per signal.
- Lower/upper thirds are discovered from the athlete's own durations (floor(n/3) observations each). Tail boundaries must differ by at least 0.5 hour, a variation guard, not a sleep target.
- Compare descriptive mean existing performance values. Split observations chronologically in half; tied-rank Spearman correlations must have the same nonzero direction in both halves and agree with the tail mean difference. Otherwise show no consistent association.
- This guard is not statistical significance, a confidence interval, causal evidence, or an effect-size threshold. Serial dependence, multiple comparisons, selection/missingness, illness, time trends, workload and workout changes remain confounders. Results are exploratory. Groups are ordered by coverage, not strength of association. Tiny samples still have a scatter plot, but no association statement.
- Recent baseline compares the last 7 calendar days with the preceding 21, in the current selected sleep timezone. Missing dates are omitted, never zero. Baseline needs 7 known nights; a comparison also needs 3 recent nights. Coverage is displayed.

## Migration and release boundary

Pending migration: `20260930193925_sleep_recovery_nights.sql`, generated with the Supabase CLI migration workflow. It creates only `health_sleep_nights`, with own-user SELECT/INSERT/UPDATE RLS, no authenticated DELETE, and no anonymous access. No legacy data is changed by this migration. Raw health data has the same per-athlete boundary as its derived totals.

Review and apply this single migration through the project's controlled release process before enabling the full experience. No broad db push is required. If the table is absent, the page shows unavailable and sync warns while preserving the working cardio pipeline. This task did not apply any production migration, change production data/configuration, deploy or merge.

The iOS aggregation fix and dashboard use the existing bridge and can ship through the hosted web app after schema review; no iOS/TestFlight release is required for these changes. Per-sample UUID/source app/device/timezone, reliable Android asleep/stages, and timestamped resting-HR/HRV history require separate native ingestion work. Existing RHR/HRV latest values are assigned to sync day without measurement timestamps, so this phase intentionally makes no next-day HRV/RHR recovery claim.

## Validation and manual release checks

Automated coverage includes duplicate/overlap/stages/awake, cross-midnight and DST, unknown categories, session-only data, naps, boundaries; temporal pairing, baseline coverage, deterministic descriptive analysis; sync idempotency and graceful storage failure; read pagination/ownership and UI missingness. `scripts/test-sleep-recovery.mjs` replays the migration in disposable PostgreSQL (PGlite) and checks own-user upsert, isolation, ownership protection, anonymous/delete denial and constraints. PGlite is a temporary validation dependency, not an application dependency.

Before rollout, in a reviewed staging environment:
1. Apply only the pending migration. On an iPhone with real Health sleep access, sync twice. Check Health's source intervals against actual asleep, in-bed and stages; verify one row per provider/wake date and unchanged cardio records.
2. Check missing permissions, no sleep, in-bed-only and conflicting source data; there must be no fabricated zeros/stages or authoritative association.
3. Open Progress → Sleep & Recovery on a narrow iPhone and in the native shell. Verify navigation, safe-area/tab-bar clearance, source/signal controls, long labels, chart titles, and report links.
4. Verify actual following-day training against its source report; inspect a long run before sleep and its separate standardized segment context. No relationship is asserted from that single run.
5. Review timezone/travel and fragmented/shift-work cases with known history before broadening analytical coverage. Confirm unrelated PO/cardio/competition results remain unchanged.

Validation recorded for this branch: 399 tests in 52 files passed; focused recovery/health coverage 55 tests in 6 files; TypeScript passed; production Webpack build passed; six disposable PostgreSQL checks passed. A synthetic 390px-wide dashboard fixture was visually inspected for trends, association context and training cards. This does not substitute for real-device native-shell/HealthKit verification above.

Read-only production ledger inspection on September 30 found latest recorded version `20260929202320` (`flexible_program_days`), older than this pending migration. Existing production versions for flexible/optional program days and Sunday reports differ from the repository filenames; reconciliation is separate work, and this branch does not change them. Review that existing ledger discrepancy before any release migration command; do not broad-push this directory.
