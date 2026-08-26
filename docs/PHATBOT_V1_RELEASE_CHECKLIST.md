# PHATBOT v1 Release Checklist

## Launch rule

Fix anything that prevents an athlete from training, understanding the result, or trusting the data. Defer features that only make PHATBOT cooler to v1.1+.

## Phase 1 - Release QA

- [x] Production build is green on Vercel.
- [x] Athlete signup, login, logout, password reset, and session recovery work on mobile.
- [x] Coach signup and athlete/coach connection flow work.
- [x] Workout templates load, edit, reorder, and start correctly.
- [x] Live workout can log working, top, backoff, partial, tempo, drop, and timed sets.
- [x] Extra working set with 3+ full reps scores as a PO win on an established exercise.
- [x] Tempo and drop sets add workload volume but do not create PO losses or PRs.
- [x] Timed sets compare duration-to-duration and do not contaminate weight x rep volume.
- [x] Last Performance always uses the most recent actual performance of the exercise and shows the date.
- [x] A skipped recent workout does not erase older exercise history.
- [x] PR and Best-at-Weight detection use all applicable historical data.
- [x] Skipped exercises are NOT SCORED and do not become regressions or fake baselines.
- [x] Workout report agrees with the live workout result.
- [x] Training Volume vs Last Workout is labeled and explained as workload volume, not strength.
- [x] Progress Center, Workout Trends, Exercise Telemetry, PR history, and timed history update after completion.
- [x] Coach feedback/transmissions display and read state works.
- [x] Refresh/reconnect during a live workout does not lose recently saved work.
- [x] Mobile UI has no blocking layout, tap-target, keyboard, or scrolling issues on current iPhone Safari.

## Phase 2 - Production essentials

- [ ] Production Supabase and Vercel configuration reviewed.
- [ ] Error states do not expose sensitive technical details to athletes.
- [x] Privacy policy published and linked.
- [x] Terms of use published and linked.
- [x] Support/contact page or support email published and linked.
- [x] Account deletion flow available in the app if account creation is supported.
- [ ] Data collected by PHATBOT is documented for App Store privacy disclosures.
- [ ] No test/debug accounts, fake data, or developer-only controls are visible to normal users.

## Phase 3 - iOS / TestFlight

- [ ] Apple Developer Program account active.
- [ ] PHATBOT bundle identifier and App Store Connect app record created.
- [ ] Existing web app packaged as an iOS app with intentional native shell behavior.
- [ ] App icon, launch screen, status-bar/safe-area behavior, keyboard behavior, and external-link handling verified.
- [ ] Login persists correctly after app close/reopen.
- [ ] Camera/photo/file permissions are described only if the production app actually requests them.
- [ ] First TestFlight build installs and launches successfully on a physical iPhone.
- [ ] TestFlight smoke test completed by Eric.
- [ ] Small external beta group invited.
- [ ] Beta feedback limited to launch blockers, misleading data, crashes, and serious UX problems.

## Phase 4 - App Store submission

- [ ] App name, subtitle, description, category, keywords, and support URL finalized.
- [ ] App Store icon and required screenshots prepared.
- [ ] Age rating completed.
- [ ] App privacy questionnaire completed accurately.
- [ ] Review notes explain PHATBOT's workout, coaching, and progress features.
- [ ] Working review account supplied if login is required.
- [ ] Subscription/payment implementation, if included in v1, satisfies Apple requirements. If not required for first release, defer it.
- [ ] Final production build selected in App Store Connect.
- [ ] Submit PHATBOT 1.0 for review.

## Explicitly allowed to wait for v1.1+

Do not delay v1 solely for these unless they become required by beta testing:

- Nutrition tracking
- Apple Health / HealthKit integration
- Push notifications
- Expanded exercise video library
- More charts or dashboard widgets
- Additional coaching intelligence
- Social/community features
- Cosmetic animation polish
- Advanced subscriptions/pricing experiments
- Android release
- Any feature whose main argument is "this would be cool"

## Release gates

### Alpha exit
Eric can complete real workouts without losing data or encountering misleading core scoring/history behavior.

### Beta / TestFlight gate
A new athlete can create/access an account, understand how to start a workout, complete it, and understand the resulting report without developer assistance.

### App Store 1.0 gate
No known launch-blocking bugs, no known trust-breaking data errors, production/legal requirements are complete, and the TestFlight build has survived a small real-user beta.
