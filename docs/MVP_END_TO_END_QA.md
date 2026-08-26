# PHATBOT MVP End-to-End QA

Use this checklist after scoring, workout-entry, reporting, or history changes. The goal is to validate one complete athlete workflow without changing production data rules.

## 1. Start / Resume
- Start a workout from a template.
- Refresh once after the session begins.
- Confirm the active workout resumes with saved data intact.
- Confirm the dashboard shows Resume Workout while the session is active.

## 2. Working Set + Progressive Overload
- Log a normal working set that beats the corresponding previous set.
- Confirm the live set shows WIN.
- Log a matched or lower performance and confirm the expected neutral/down state.

## 3. Partial Rep
- Match prior full reps and add at least one partial rep.
- Confirm the set receives a progression WIN.
- Confirm the saved set displays the partial-rep count after refresh.

## 4. PR / Best at This Weight
- Log a heavier eligible working/top/backoff set than any historical load for the exercise.
- Confirm live display shows TRUE PR.
- Log more reps at a previously used load without exceeding the all-time load.
- Confirm live display shows BEST AT THIS WEIGHT rather than a true PR.
- Confirm warmup, drop, tempo, and timed sets do not create lifting PRs.

## 5. Tempo Set
- Add a Tempo set at a deliberately reduced load.
- Confirm it saves successfully.
- Confirm it does not create a PO loss or lifting PR.
- Confirm it remains eligible for workload-volume calculations.

## 6. Drop Set
- Add a Drop Set immediately after a scored set.
- Confirm it saves successfully.
- Confirm it does not affect the PO score or create a lifting PR.
- Confirm it contributes to workload volume.

## 7. Timed Set
- Add a Timed set using seconds only.
- Confirm it saves and displays as duration rather than weight x reps.
- If historical timed data exists, beat the prior duration and confirm the live timed result shows progression.
- Confirm timed work does not add weight x rep volume or create a lifting PR.

## 8. Notes
- Add workout notes, exercise notes, and a set note.
- Save or log the set.
- Refresh and confirm all notes persist.

## 9. Skip / Completion
- Leave at least one programmed exercise without a set.
- Confirm the Complete Workout button communicates how many exercises will be skipped.
- Complete the workout.
- Confirm skipped exercises are unscored rather than regressions.

## 10. Workout Report
Confirm the completed report shows the correct:
- Progressive Overload Score.
- Workout completion percentage.
- Training volume vs last comparable workout.
- True PRs versus Best at This Weight milestones.
- Timed performance, where applicable.
- Skipped/unscored exercises.
- Coaching summary that reflects both performance and workload context.

## 11. Progress Center
- Open the Progress Center after completion.
- Confirm the new workout appears in the relevant date range.
- Confirm PO score and workload/strength metrics are consistent with the workout report.

## 12. Workout Trends
- Open Workout Trends for the completed workout template.
- Confirm the new session appears in chronological history.
- Confirm baseline sessions remain labeled Baseline rather than 0%.
- Confirm imported and native sessions with the same canonical workout are combined correctly.

## 13. Exercise Telemetry
For at least one lifting exercise:
- Confirm the new session appears.
- Confirm all-time best and vs-prior values are sensible.
- Confirm archived PR history did not create a false PR.

For a timed exercise:
- Confirm timed history is available even when older data used legacy duration formatting.
- Confirm duration is compared to duration, not weight/reps.

## 14. Recovery / Reliability
- Refresh the app during an active workout and confirm entered sets are preserved.
- Verify buttons do not duplicate writes when tapped repeatedly while processing.
- Confirm failed/empty screens give a useful recovery message instead of silently appearing empty.

## Pass Criteria
The regression pass is complete when the full workflow can be executed without data loss, false PRs, false regressions, incorrect special-set scoring, or contradictions between live workout, report, Progress Center, Workout Trends, and Exercise Telemetry.
