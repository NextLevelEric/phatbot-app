# Apple Health ingestion authority fix

Branch: `codex/apple-health-sync-authority-fix`.
Base: production main `7e5758c4f8d41b33e3aa5df73d20400f17c0d5f2`.
Audit and validation: September 21, 2026. No production writes, migrations, configuration changes, merge, or production deployment performed.

## Confirmed cause and limits

There were three ingestion implementations. Account renders both `HealthConnectionCard` (embedded in the account page) and `HealthConnectionPanel` (layout-mounted floating panel, visible on Account). Amanda's reported button names occur in these controls; the embedded card is a likely path, but her exact tap path and current device permissions cannot be established remotely.

| Entry point before fix | Destination | Problem |
| --- | --- | --- |
| Account HealthConnectionCard -> inline sync -> getNativeHealthSnapshot(14) | athlete_health_daily_metrics, athlete_health_workouts, athlete_health_sleep_sessions; connection metadata | Canonical Activity/Progress never receives these writes. Connection timestamp was written concurrently with data, even if another write failed. |
| Account HealthConnectionPanel -> syncNativeHealth(14) | health_daily_metrics, cardio_activities, cardio_activity_segments | Correct destinations; Connect only authorized, save counts were not verified, and competition refresh could falsely report success. |
| Home RebuildDashboardStatus -> its own HealthKit proxy and persistHealthSnapshot | health_daily_metrics, cardio_activities | Duplicate mapping with no comparable-segment ingestion. |

The authority split is a confirmed defect. It is not proof that permissions or device data availability play no part in Amanda's latest missing records. HealthKit does not expose read-denial status: empty results may mean denied access or no matching records. See [Apple authorization documentation](https://developer.apple.com/documentation/HealthKit/authorizing-access-to-health-data).

## New path and consumers

Every existing control calls `syncNativeHealth(14)`. Connect first requests native authorization; Sync directly calls the shared function. The shared function reads native data, writes canonical daily/workout/segment records, verifies returned save counts/IDs, then updates connection metadata and invokes the existing competition lifecycle refresh. Each initiating UI displays the shared counts or safe diagnostic; Home refreshes its snapshot only after confirmed saves. Activity/Progress load canonical records when opened.

| Consumer | Authority |
| --- | --- |
| Activity & Cardio, steps | health_daily_metrics, cardio_activities |
| Comparable efforts / Cardio Trends | cardio_activities, cardio_activity_segments |
| Cardio Bunny | existing canonical workout/segment scoring SQL |
| Step King | health_daily_metrics |
| Sunday reports | existing canonical health/cardio aggregation and immutable snapshots |
| Account connection history | athlete_health_connections |

No source-code, production view, function, or trigger consumer of the legacy raw daily/workout/sleep tables was found. No legacy-to-canonical bridge was found. Those tables and all historical rows remain intact, but new redundant raw legacy writes stop. `athlete_health_connections` remains a live dependency and is written centrally only after canonical saves complete. Read-only production policy inspection confirmed own-athlete select/insert/update access for the canonical tables and connection metadata.

Provider/source mapping remains `apple_health` -> `healthkit`; `health_connect` -> `health_connect`. Unchanged conflict keys:

- Daily: `(athlete_user_id, metric_date, source)`.
- Workouts: `(athlete_user_id, source, source_workout_id)`.
- Segments: `(cardio_activity_id, segment_key)`.
- Connection: `(athlete_user_id)`.

Native duplicate IDs are collapsed before upsert; repeated sync retains existing canonical IDs. Concurrent calls for the same signed-in athlete share a promise. The account is checked again after the native read, before saving. Raw workout identity, type/name, timestamps, duration, distance, energy and available average HR remain mapped. Missing optional fields preserve existing stored values.

Entirely empty/all-zero reads do not update rows or stamp success. Native 14-day aggregate steps/energy are never inserted as today's daily value. Ambiguous zero daily steps/energy preserve a known positive value; this conservative recovery policy means a legitimate correction to zero requires separate reconciliation rather than being inferred from a possibly revoked permission. There are no deletes. Partial writes are possible across tables; errors disclose confirmed counts and that some records may already be saved. Explicit retry uses the same stable keys. Competition-refresh failure returns a warning that health data saved but standings did not refresh.

## Native audit and scope

HealthKitManager already requests/reads workoutType, stepCount, distanceWalkingRunning and distanceCycling. Walking maps to `Walk`, cycling to `Bike Ride`, running to `Run`. HealthKitPlugin already enriches supported distance workouts with samples. There is no evidence warranting permission or mapping changes. Actual Amanda permission state remains unverified.

No Swift, Kotlin, native permissions, Capacitor configuration, scoring, segment algorithm, schema or migration changes. Capacitor sync was not run because no native inputs changed. `healthkit.ts` only exposes availability through the existing shared plugin proxy, removing the duplicate Home proxy.

Existing segment targets remain run/walk/hike 1 mile, 5K and 10K where enough samples exist. Cycling is imported into Activity; this fix does not introduce cycling benchmarks. Health Connect uses the same pipeline and existing provider mapping; its current snapshot lacks distance samples, so segments are not fabricated. The pre-existing Home mount-time sync for a remembered connection remains routed through the shared authority. No foreground/resume sync feature was added.

## Amanda read-only evidence and recovery

Audit for the requested athlete found:

| Data | Count | Latest record |
| --- | ---: | --- |
| Legacy workouts | 11 | 2026-09-07 08:21:25 UTC |
| Canonical workouts | 23 | 2026-09-12 08:18:50 UTC |
| Legacy daily records | 15 | 2026-09-07 |
| Canonical daily records | 26 | 2026-09-12 |
| Recorded connection sync | — | 2026-09-07 13:49:34.495 UTC |

All 11 legacy source workout IDs already exist canonically. There are zero legacy workouts in the current rolling 14-day window and zero missing recent legacy daily dates. Canonical data is more recent than legacy data. There is no useful recent legacy backfill operation to prepare; no data-mutation script was created or executed.

After separately approved rollout:

1. Amanda opens PHATBOT in the installed iPhone app, signed into her own account, with network access. The current wrapper loads the production web URL; Safari alone cannot exercise native HealthKit.
2. In Apple Health's PHATBOT permissions, allow reading Workouts, Steps, Walking + Running Distance and Cycling Distance, plus the other categories she wants. Confirm a known walk and cycling workout exist within the latest 14 days. Do not delete or recreate workouts.
3. Return to Account and tap **Sync Health Data** once. If initial authorization is needed, tap **Connect Apple Health**, complete the prompt, and allow its shared sync to finish. Capture the displayed daily/workout/segment counts or safe error.
4. Open Progress -> Activity & Cardio. Check the known walk, cycling duration/distance and daily steps. Open a walking/running trend only when sufficient distance samples exist. Cycling does not require a comparable-segment row to count as a successful Activity import.
5. Sync again and confirm the same source IDs, canonical row IDs and row counts remain stable. Daily metrics may legitimately change as today's source data grows.
6. For empty or zero-workout diagnostics, recheck date range and read permissions; do not infer access from the remembered connection badge. If still missing, collect workout date/type and sync message for targeted native investigation.

Yes: the shared upserts safely recover records returned by her phone's current 14-day native query, including previously missing canonical rows. This depends on granted access, records present on that phone, authentication and successful database writes. Older-than-window records are not recovered by this action. Native daily buckets may span 15 calendar dates for a rolling 14-day interval. Already finalized weekly report snapshots remain immutable; late imports do not rewrite them.

## Validation

- Focused health/cardio/competition/weekly tests: **95 passed in 11 files**. Health-specific coverage: 30 tests across the shared pipeline and real Account button handlers/integration contracts.
- Walk and cycling raw-field persistence, daily steps, a real 1-mile walk segment, repeat IDs, duplicate native IDs, concurrent requests, Health Connect, permissions, empty/all-zero reads, partial database failures, missing returned workout IDs, competition refresh warning, and account switch protection covered with mocked native/Supabase boundaries.
- Cardio Trend / comparable-effort and Cardio Bunny identity/scoring contracts pass; their implementation and SQL are unchanged. These are unit/contract checks, not a production award calculation.
- Full suite: **359 passed in 46 files** (includes scoring and native startup contracts).
- `npm run typecheck`: passed.
- `npm run build -- --webpack`: passed, 38 static pages generated.
- `git diff --check`: passed.
- No database migration/replay required; no schema changes. No native-device sync was executed in this environment.

Before production rollout, use a native test build pointed to an isolated test backend (without changing tracked production wrapper configuration) to run the walk/cycling/repeat-sync steps, deny permissions to check empty diagnostics, and verify Health Connect on Android. Browser preview cannot establish HealthKit correctness. Recommend a controlled rollout after this device smoke test, followed by Amanda's explicit resync and read-only verification. Do not mark Amanda recovered solely from automated tests.

## Changed files

- `src/lib/healthSync.ts`: single canonical authority, validation, save verification, diagnostics, deduplication and status/competition refresh.
- `src/lib/healthkit.ts`: shared native availability wrapper.
- `src/components/HealthConnectionCard.tsx`: shared Connect/Sync, safe status loading and outcomes; removes legacy mapper.
- `src/components/HealthConnectionPanel.tsx`: shared Connect/Sync and counts; removes duplicate competition refresh.
- `src/components/RebuildDashboardStatus.tsx`: removes local mapper/plugin registration; shared result and existing trigger.
- `src/features/health/healthSync.test.ts`: persistence/failure/idempotency regression tests.
- `src/features/health/healthUiIntegration.test.tsx`: Account handler and native/UI integration contracts.
- This handoff.

Commit, remote verification and preview status are supplied with the final handoff after push. Local build used ignored public browser environment values only; no secret, environment file or generated build configuration is included in the commit.
