# PHATBOT iOS Packaging Plan

## Goal

Ship PHATBOT to TestFlight and the App Store without rebuilding the working Next.js application in Swift. The iOS app will use Capacitor as the native container and load the production PHATBOT web application from Vercel.

## Identity

- App name: PHATBOT
- Bundle identifier: `com.nextleveldigitalmedia.phatbot`
- Initial version: `1.0`
- App Store SKU: `PHATBOT-IOS-001`
- Production web origin: `https://phatbot-app.vercel.app`

## Why Capacitor

Capacitor gives PHATBOT a standard iOS project and access to native APIs without replacing the existing React/Next.js product. It keeps one core application while allowing iOS-specific behavior where it improves the experience.

## Phase A - Native shell foundation

1. Add Capacitor Core, CLI, and iOS packages.
2. Configure PHATBOT app identity and production server URL.
3. Generate the native `ios/` project with `npm run ios:add` on a Mac with Xcode.
4. Open the Xcode workspace with `npm run ios:open`.
5. Set signing team, bundle ID, version 1.0, and build number 1.
6. Run on a physical iPhone before creating any TestFlight archive.

## Phase B - iOS behavior QA

Verify on a physical iPhone:

- Safe-area layout around Dynamic Island/home indicator.
- Login, signup, email confirmation, password reset, and logout.
- Supabase session persists after force-close/reopen.
- Live workout set entry and keyboard behavior.
- Refresh/reconnect recovery.
- Coach invitations and coach transmissions.
- Account deletion.
- Privacy, Terms, and Support links.
- External links do not trap the user in an unusable web view.
- No horizontal scrolling or inaccessible controls.

## Phase C - Native value before App Store submission

Apple requires the app experience to be more than a repackaged website. Before public App Store submission, add small native integrations that improve the real training experience rather than cosmetic wrapper features.

Recommended v1 native additions:

1. Haptic feedback for meaningful workout actions such as a confirmed PR or completed workout.
2. Native network awareness so PHATBOT can clearly communicate connection loss/recovery during a live session.
3. Native status-bar/safe-area treatment matching PHATBOT's black/red interface.
4. App-specific icon and launch screen.

Push notifications and HealthKit remain post-launch unless beta testing shows they are needed.

## Remote-content decision

The first TestFlight shell will load the production PHATBOT Vercel URL. This minimizes duplicate application logic and keeps scoring/report behavior identical to the verified production web app.

Before App Store submission, re-evaluate this architecture during TestFlight. If Apple review risk or offline requirements justify it, PHATBOT can move more presentation code into the bundled shell later without changing the core backend.

## Local Mac commands

After cloning the `feature/ios-shell` branch on a Mac:

```bash
npm install
npm run ios:add
npm run ios:sync
npm run ios:open
```

Do not merge the generated iOS project to `main` until the native shell launches successfully and the production web app passes the iPhone smoke test.

## Launch gate

The iOS-shell work is considered ready for TestFlight when:

- Native project builds in Xcode.
- PHATBOT launches on a physical iPhone.
- Authentication persists after app restart.
- A real workout can be started, logged, refreshed/reconnected, completed, and reviewed.
- Account deletion works inside the app.
- No blocking safe-area, keyboard, scrolling, or external-link issues remain.
