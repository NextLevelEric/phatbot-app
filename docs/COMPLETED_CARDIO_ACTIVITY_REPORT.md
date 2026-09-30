# Completed cardio activity report and dashboard

## Problem and behavior

Activity & Cardio previously emphasized extracted benchmarks and hid whole activities in simple, non-linked history rows. Athletes could see a slower 5K within a long run without an explanation of the entire workout.

The dashboard now shows a rolling 30-day snapshot: cardio sessions, recorded duration, recorded distance with coverage, and the longest activity by duration with its activity type. Per-type summaries compare recorded sessions/time with the preceding 30 days. Runs, walks, rides and other cardio types never share a pace average. The existing comparable-effort selector and charts remain between the snapshot and richer recent activity cards. Cards show distance, duration, appropriate pace/speed, available HR, supported milestones, and a report link. Existing progression history also links to activity reports.

`/progress/activity/[id]` displays stored whole-workout measurements and a deterministic PHATBOT Activity Report, followed by a distinct standardized-segment section. Each segment uses the existing comparable-effort grouping/change/context helpers and links to its progression page and previous activity. A slower embedded segment does not reduce or score the whole workout.

## Data audit and acceptance fixture

Read-only production schema inspection confirmed canonical distance, duration, average HR, active energy, activity identity, timestamps and provider provenance. Segments store benchmark distance/time and offsets. Elevation, cadence, moving duration, route geometry and HR time series are not stored; they are omitted. Adding them would require a separately scoped native/schema enhancement.

The September 27, 2026 run has 14,793.35 meters, 6,965.22 seconds, average HR 130.90 and active energy 1,172.61 kcal. The report renders **9.19 mi, 1:56:05, 12:38/mi and 131 bpm**. Stored segments include 1 Mile, 5K and 10K. The 5K is 2,153.934 seconds (**35:54**), versus the preceding September 20 5K at 2,064.569 seconds (**34:25**): **1:29 slower**. Read-only inspection of the preceding 30 days also supports longest recorded run distance and duration. The regression fixture uses these reviewed measurements with synthetic IDs and no athlete identifier.

## Integrity and boundaries

- New report/history reads explicitly filter by the authenticated athlete. No service credentials or privileged RPCs are used. Existing RLS remains unchanged. Invalid, missing and inaccessible report IDs do not load related history.
- Dashboard reads paginate a complete 60-day window for two 30-day summaries and recent-card milestones. Report milestones use a complete 30-day window anchored to the workout timestamp, not today's date. Claims require at least one earlier measured same-type activity, strict improvement, and successful history loading. Ties, future activities and other modalities do not qualify.
- A report's previous segment query finds the immediate earlier positive-duration matching type/key/distance, including efforts outside the milestone window or the existing progression loader's recent sample. It uses the existing progression grouping rules. New report code does not change the original progression loader, segment extraction or scoring rules.
- Missing numeric data is omitted. No fitness, efficiency, training-intent, personal-best/all-time or recovery claims are inferred. Milestones explicitly refer to recorded history, which may be incomplete until synced. Whole-workout pace uses stored duration and distance, not inferred moving time.
- Query failures preserve readable whole-workout measurements and show comparison-unavailable messages. Partial history cannot establish a milestone. Failed reads are never treated as an empty comparison history.
- No writes or sync calls occur in the new report loader/page. Dashboard's existing native sync flow is preserved; its successful reload now also remounts the existing progression component to refresh segments.
- No migration, native iOS/Android changes, dependency changes, sleep changes, competition scoring changes, duplicate records or production mutations.

## Validation and manual review

- Cardio-focused tests: 27 passing across 4 files, including the reviewed run, rendered reports/links, missing metrics, pace rounding, modality separation, date boundaries, incomplete history, pagination and athlete scoping.
- Full suite: 374 passing across 48 files.
- TypeScript and production Webpack build pass using current main's locked dependency versions.
- Joined previous-effort query syntax verified with a read-only anonymous request against the existing API; it returned zero athlete rows.
- Local rendered-fixture report/dashboard reviewed at 390 × 844 with production CSS. This is layout/fixture validation, not an authenticated iPhone end-to-end run.
- Final `git diff --check` must pass before commit.

Manual acceptance before merge: sign into the preview with the fixture athlete; open Activity & Cardio, then the September 27 run. Confirm the full-run measurements/milestones, all three segments and the 5K comparison. Follow previous-activity and progression links, use Back, and check a walk, ride and activity missing HR/distance. Confirm an activity belonging to another account returns unavailable. On iPhone, confirm safe areas/navigation and that existing Sync refreshes cards and progression. No further native HealthKit permissions or TestFlight release is required by these web changes.

Implementation files: `activityReport.ts` (deterministic calculations), `activityReportData.ts` (read-only queries), `CardioActivityReport.tsx`, `CardioDashboard.tsx`, the new activity detail route, updated dashboard and progression history links, plus fixture/tests and this note. Production deployment and merge are deliberately left to the review process.
