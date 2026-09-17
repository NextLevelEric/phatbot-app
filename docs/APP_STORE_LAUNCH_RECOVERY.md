# App Store launch recovery audit — September 16, 2026

Branch: `codex/app-store-launch-recovery`.
Base: production main `611756877a3e331ef76c6aebf538f071e7049341`.
No Sunday Report or optional Day 6 changes are included.

## Conclusion and evidence

**Apple's exact build-25 failure is not reproduced or conclusively diagnosed.**
The submitted IPA/archive, its effective configuration, Apple screenshot/logs, and
a macOS/iOS environment were unavailable. Do not present this as a verified fix
for the specific rejection until the device checks below pass.

Two concrete recovery defects were established:

1. A failed initial remote navigation has no recovery UI. `server.url` points at
   the live website, but no `server.errorPath` was configured. Capacitor 8.5.0's
   `WebViewDelegationHandler.didFailProvisionalNavigation` / `didFail` only load a
   local fallback when that setting exists. The bundled placeholder was not an
   automatic offline fallback. React error boundaries cannot run before the web
   application downloads. This is a code-confirmed path, not a native reproduction.
2. Home awaited `getSession()` and a `Promise.all` of seven data queries without
   any application deadline. Even a stalled optional profile read blocked Home.
   Deterministic injected stalled-session and stalled-profile tests reproduce
   persistent loading on the original main source and reach Retry with this fix.
   Overlapping auth-triggered loads also lacked cancellation/stale-result guards.

Normal production `/` and `/auth` returned HTTP 200 during this audit. A logged-out
desktop browser reached signup from `/`. There is no evidence that Apple actually
experienced a DNS outage, Supabase outage, HealthKit crash, or iOS-27-specific bug.

## Startup architecture and sequence

This is **B: remote web application**, with bundled recovery HTML. It is not a
bundled Next.js app and does not provide offline workout access.

1. iOS displays `LaunchScreen.storyboard`.
2. `AppDelegate` supplies a scene configuration with `SceneDelegate`.
3. `SceneDelegate` creates a window and `PHATBOTBridgeViewController`.
4. Capacitor creates WKWebView, loads generated `capacitor.config.json`, starts its
   bridge, and calls `capacitorDidLoad`. Custom HealthKit and media plugins register.
5. Capacitor verifies the bundled `public/index.html` exists, then navigates to
   `https://app.phatbotfit.com`. It does not first display the bundled placeholder.
6. The remote Next.js root supplies a server-rendered loading screen; downloaded
   JavaScript hydrates the root layout and Home.
7. `createSupabaseBrowserClient` uses the hosted build's public environment values.
   `getSession()` resolves cookie-backed auth. No session redirects to `/auth`.
8. A session starts profile, workout-template, latest-session, active-session,
   coach-feedback, plateau, and signal-read queries. Feedback can add one read.
9. Home renders, then its optional components load. HealthKit is not awaited by Home.

No middleware/proxy auth gate, service worker, or cache-first application loader
was found. `/auth` has signup and sign-in modes, not separate `/login` and `/signup`
routes. There is no startup `/onboarding` redirect. Invitation activation and
program selection are separate flows. No normal `/`–`/auth` redirect loop was found.
The scene storyboard also names a standard bridge controller while SceneDelegate
creates the custom controller; no demonstrated failure justifies changing this.

## Clean installation, auth, and data

The normal fresh path needs no cookies, localStorage, athlete profile, or HealthKit
authorization to reach `/auth`. The inspected Supabase SSR browser client uses
cookie storage, PKCE, session persistence, and automatic refresh. The remote site
and cookies remain on the same HTTPS origin inside WKWebView. No native cookie
override is configured. iOS persistence still requires install/update testing.

Home uses `getSession`, not a server-side authorization decision; database RLS
continues to protect reads. Missing/denied profile data retains the generic Home
greeting. Critical workout query errors show recovery UI. An SDK-cleared invalid
session goes to auth; returned session errors show Retry. A refresh that stalls
is bounded without forcibly deleting cookies or signing an athlete out.

Root-layout background components also run auth reads. Role navigation can wait
for role data, and ScorePersistenceAgent may backfill derived scores for a signed-in
athlete. We did not log in as a production athlete or exercise those mutations.
No scoring code changed. Pending-room and role localStorage reads are guarded;
empty storage does not block the normal fresh path.

The existing auth form bounds its initial signup/sign-in request at 12 seconds,
but subsequent session verification, analytics, invitation claim, coach lookup,
and confirmation resend do not share that deadline. This is a remaining possible
post-submit wait, not evidence of Apple's pre-login launch issue. Those mutation
flows were not automatically retried or refactored in this patch.

## Changes and recovery behavior

- `capacitor.config.ts`: uses bundled `index.html` as `server.errorPath`.
- `ios-shell/index.html`: self-contained error message, saved-data reassurance,
  and an absolute HTTPS Retry link to the production root. No scripts, remote
  styles, fonts, images, auth, or plugins are needed to display it.
- `ios/App/App/SceneDelegate.swift`: observes document loading and falls back
  after 20 seconds if a navigation remains loading. Preserves Capacitor's own
  navigation delegate, plugin registration, and universal-link logic. Retry is
  another document navigation and gets the same deadline. The native log records
  only a fixed timeout reason, not a URL, session, or athlete data.
- `src/features/auth/startupAttempt.ts`: 15-second read-only startup deadline,
  AbortController, explicit cancellation, and suppression of late completion.
- `src/app/page.tsx`: bounds session plus data loading; aborts PostgREST reads;
  cancels replaced/unmounted loads; ignores duplicate INITIAL_SESSION loading;
  defers other auth-event loads out of the notification stack; handles missing
  public configuration; logs sanitized failure categories and optional-data failure.
  Existing Try Again reloads the page. It does not clear cookies or workout data.
- Three regression files and `vitest.config.mts`: exercise the actual Home effect
  with mocked hooks/SDK, generic cancellation, and native packaging contracts.
  No new runtime or test dependencies.

The native 20-second deadline covers a still-loading document. It is not a
JavaScript-hydration watchdog: a document that finishes while required JavaScript
fails can still need further diagnosis. Home's 15-second deadline starts only
once its effect runs. Very slow connections may legitimately reach Retry.

## Native, HealthKit, and Release configuration

Capacitor core/CLI/iOS are all 8.5.0; Swift package dependency matches. Deployment
target is iOS 15.0, Swift language setting 5.0, device families iPhone and iPad.
Release uses automatic signing and an empty Swift DEBUG compilation condition.
Bundle ID is `com.nextleveldigitalmedia.phatbot`. ATS exceptions and HTTP transport
were not added; production uses HTTPS and `cleartext: false`. The correct domain
returned directly without a redirect during the HTTP audit.

HealthKit permission is requested by user action. The native plugin creates an
HKHealthStore but does not request permission during registration. Once Home
renders, RebuildDashboardStatus checks availability; only a remembered connection
can trigger background sync. Fresh installs have no connection flag. Availability
errors are caught. Denied/unavailable runtime behavior was not tested on iOS.

The Webpack warning comes from two JS `registerPlugin('HealthKit')` declarations
in `src/lib/healthkit.ts` and `RebuildDashboardStatus.tsx`. Capacitor returns the
existing proxy on duplicate registration. The warning also appeared in a usable
logged-out browser. It does not demonstrate duplicate native registration or a
launch crash. HealthKit permissions, entitlements, and scoring remain unchanged.

Tracked native metadata says **1.0 (1)** for Debug and Release. The rejection says
**1.0 (25)**; build 25 therefore used an override or state not represented here.
Recommend **marketing version 1.0, build 26**, only after confirming 26 has not
already been uploaded; otherwise use the next unused number above all uploads.
Metadata was audited but not bumped. Compare build 25's archived Info.plist,
capacitor.config.json, public assets, signing, and Git source to this branch.

No Xcode/simulator/device exists in this Windows environment. Native Swift
compilation, signing, archive export, iOS 27 compatibility, plugin runtime,
clean/update installs, foreground/background and force-quit behavior are unverified.

## Environment and secret audit

The native bundle loads the hosted build; Supabase settings belong to that web
build. Thirteen directly referenced production launch/auth JavaScript chunks were
read. They contained the expected `fwcokqxhqrivrjazmoyd.supabase.co` URL and one
publishable key, with no `sb_secret_` key or service-role JWT detected.

The worktree initially had no configured public environment. An initial build
compiled anyway, demonstrating that build success alone does not verify runtime
configuration. The final Webpack build used only the public URL/key recovered
from the public deployment in an ignored `.env.production.local`. No server secret
was copied. An artifact scan of 83 local client files and four generated native
text files confirmed the public configuration and no secret-key/service-role-JWT
patterns. This is a scoped pattern scan, not proof about an unavailable signed IPA
or every possible secret format. Generated fallback matched source exactly.

## Validation results

| Check | Result |
| --- | --- |
| Full Vitest suite | 39 files, 294 tests passed |
| Focused auth + native contract tests | Included in full suite; 15 new tests |
| Baseline reproduction | New Home harness against original main: 4 pass, 6 fail; stalled auth/profile cases retain loading on baseline |
| TypeScript | `npm run typecheck` passed |
| Production Webpack | `npm run build -- --webpack` passed with public production configuration; known nonfatal HealthKit warning |
| Normal browser launch | Production and local production build reach `/auth`; local signup-to-sign-in toggle works |
| Browser errors | No error captured during local launch; known duplicate HealthKit warning |
| Capacitor sync | Passed; production URL and fallback present in generated config/assets |
| Capacitor Doctor | Blocked: Xcode not installed; installed Capacitor versions aligned |
| Native build/tests | Not run: Windows, no Xcode or iOS runtime |
| Lint | Existing `next lint` script fails: installed Next.js treats `lint` as a directory |
| Whitespace | `git diff --check` passed |

The Home harness executes the real effect and inspects returned UI branches with
mocked hooks/SDK. It is not a browser renderer, real expired-session test, or native
install test. Baseline failures include expected new diagnostics/abort assertions;
do not describe all six as independently reproduced athlete-facing defects.

| Requested case | Evidence / remaining test |
| --- | --- |
| 1. Fresh/no session | Mocked Home and normal logged-out browser pass; native install pending |
| 2. Existing session | Mocked Home passes; safe-account native test pending |
| 3. Expired/invalid | SDK-cleared session/error/stall simulations pass; real refresh pending |
| 4. Supabase/profile failure | Critical failure, profile denial and stalled profile simulations pass |
| 5. Offline | Injected request failure passes; native local fallback runtime pending |
| 6. Retry | New attempt/remount after restored reads passes; actual native Retry pending |
| 7. HealthKit denied/unavailable | No Home dependency established by code; iOS runtime pending |
| 8. Force quit/relaunch | Not available on iOS here |
| 9. Logout/relaunch | In-flight logout cancellation passes; real cookie persistence pending |
| 10. Update install | Not available here; no migration/storage format changes |
| 11. Release public configuration | Hosted chunks and local build verified; signed archive pending |
| 12. Secret exposure | Scoped web/native text pattern scans pass; final IPA inspection pending |

## Exact device QA before submission

Use a dedicated safe review/test account, never Eric's production workout history.
Record device, OS, build, source SHA, network conditions, time to usable UI, and
sanitized native/web logs for each case. Prefer Apple's iPhone 17 Pro Max / iOS 27.0
combination, plus a supported older iPhone and iPad because both families ship.

1. On Mac, check out this branch; install the intended dependency versions, run
   `npm run ios:sync`, inspect generated URL/errorPath and fallback. Resolve Swift
   packages, compile Release, run native checks, and create an archive without
   uploading. Inspect archive Info.plist for 1.0 and the chosen unused build number.
2. Compare the build-25 archive to current source/config. Capture any different
   remote URL, missing public files, scene settings or plugin versions before
   attributing the rejection to the defects addressed here.
3. Delete PHATBOT completely (do not offload); erase a dedicated simulator if used.
   Install Release. Normal Wi-Fi launch must show signup/sign-in without HealthKit
   permission or existing cookies. Confirm controls respond and no blank state.
4. Force quit and relaunch the logged-out app. Background/foreground during initial
   load and once loaded. Repeat on cellular and a second Wi-Fi network.
5. Launch offline on a fresh installation. Confirm bundled connection error and
   Retry appear. Restore connectivity and tap Retry: remain inside PHATBOT and
   reach `/auth`. Repeat Retry while still offline; it must remain recoverable.
6. Use Network Link Conditioner/proxy to stall the remote document for over 20
   seconds. Confirm native fallback, then successful Retry after restoring network.
   Also stall/block a JS chunk separately; capture behavior because the document
   deadline does not guarantee hydration recovery.
7. Sign into the safe account. Confirm Home, optional missing-profile behavior,
   workout list and existing history display. Do not start/complete workouts merely
   to debug launch. Then force quit/relaunch and background/foreground signed in.
8. With test-network interception, stall auth refresh or one Home query beyond 15
   seconds after hydration. Confirm training-data error, saved-data reassurance,
   and Try Again. Restore network and retry. Test a rejected/expired refresh token
   and RLS-denied profile response without changing production database policies.
9. On the safe account, deny HealthKit permission, relaunch, and verify Home stays
   usable. Repeat with HealthKit unavailable/empty and with prior authorization.
   Do not sync a real athlete's health history for this investigation.
10. Sign out and relaunch: must reach auth. Reinstall and repeat fresh launch.
    Separately test approved safe-account signup/email confirmation/activation;
    account creation and post-submit steps must complete without indefinite waits.
11. Install build 25 on a dedicated device, sign in with the safe account, then
    update in place to the recovery build **without deleting**. Verify session,
    workout history and existing app preferences, plus relaunch and Retry. Do not
    infer update preservation from a clean-install test.
12. Verify Train Together universal links still open inside the app and native
    media/HealthKit buttons function. Review final archive text assets for secrets.
    Validate demo credentials on the exact resubmission build before submission.

## Review access and notes

Apple needs a working dedicated demo account to inspect authenticated features.
No credentials were discovered/created or changed. Put the account in App Store
Connect's review sign-in fields, not in this repository. Signup requires email
confirmation when configured and is a poor substitute for ready review access.

Suggested Review Notes, after the device checklist has actually passed:

> PHATBOT requires an internet connection. On first launch, tap “Already have an
> account? Sign in” and use the demo credentials supplied in the review sign-in
> fields. Home provides access to workouts and progress. Apple Health is optional;
> declining permission does not prevent using the app. If a connection is
> interrupted, restore connectivity and tap “Try Again.” This build adds a bundled
> connection recovery screen and bounded startup loading. [Add the exact devices,
> iOS versions, and clean-install/update tests completed before resubmission.]

Do not claim Apple's precise reported failure was reproduced, or that iOS 27 QA
passed, unless those facts are later established. Attach a concise launch video
and sanitized logs if they help explain the retest to App Review.

## Release constraints and remaining risks

The architecture still depends on DNS/TLS, website uptime, downloading JavaScript,
and Supabase connectivity. Capacitor's own config documentation describes
`server.url` as intended for live reload rather than production. The fallback
reduces failure impact; it does not make PHATBOT offline-capable or guarantee App
Review acceptance. No architectural migration was attempted.

**An iOS rebuild alone does not deploy Home's web fix.** The native fallback and
deadline require a new native build; Home cancellation/deadline requires a separately
reviewed web deployment. Keep both on this branch until approved. The remote site
can also change independently of a native archive, so record the deployed web SHA
alongside the archive and QA results.

Other risks: actual build-25 configuration unknown; native Swift changes uncompiled;
post-login waits and document-finished/JS-failed launch need device investigation;
dependency ranges use `latest` and no lockfile is tracked, so rebuilding elsewhere
can use different web packages. No dependency upgrade or lockfile overhaul was made.

No merge, push-to-main, production deployment, App Store upload/submission, database
mutation, migration, credential creation, or environment change in connected
services occurred. Only local code, tests, generated validation artifacts and public
local build configuration changed.

References: [Capacitor configuration](https://capacitorjs.com/docs/config),
[Supabase auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
The Supabase changelog was checked; inspected recent breaking changes did not
identify an applicable hosted startup change. Local installed SDK source was used
to verify the actual loader, cookie and duplicate-registration behavior.
