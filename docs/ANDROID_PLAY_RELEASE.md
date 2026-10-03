# PHATBOT Google Play release bundle

## What exists and what this adds

The existing debug workflow (`build-android-apk.yml`) is preserved, using the shared tracked bridge installer and compatibility step. Capacitor 8.5.0 generates Android in CI; there is no tracked Android Gradle project. The inspected template uses Gradle 8.14.3, Android Gradle Plugin 8.13.0, compile/target SDK 36, minimum SDK 24, versionCode 1 and versionName 1.0. CI reproduced a pre-existing manifest merge failure: Health Connect 1.1.0 requires minimum SDK 26. Both workflows now raise the generated minimum to 26 (Android 8.0), without overriding library safety checks or changing native logic. It had no release-signing infrastructure. `.gitignore` now excludes generated Android/output and common signing files; never rely on ignore rules instead of reviewing staged changes.

The new `build-android-release.yml` verifies production configuration, copies the Health Connect bridge and its six audited read permissions, and applies an environment-based release signing configuration. PR checks build a debug APK, compile release code, inspect the bundle task graph and require the signing stage to reject missing credentials. They do not publish an unsigned bundle. Manual workflow dispatch is the only way to run the signed artifact job.

Identity is unchanged: `com.nextleveldigitalmedia.phatbot`, app name `PHATBOT`, hosted URL `https://app.phatbotfit.com`, HTTPS only and the existing offline fallback. The workflow checks the generated configuration and Gradle identity before signing. No signing ownership or Play package registration is decided by this code.

## Eric: one-time setup

1. Confirm in Play Console whether this package has EVER been registered/uploaded. If yes, use its existing upload key and verify the highest versionCode. Do not generate a replacement key or choose another package automatically. For a new app, keep the existing package ID; first Play upload makes that identity permanent.
2. Decide Play App Signing ownership before enrollment. For a new Play-only release, the usual recommendation is Google-managed app signing plus a separate upload key owned/backed up by you. If cross-store signing compatibility is needed, review supplying your own app-signing key first. This task does not enroll the app or make that decision. [Google signing guide](https://developer.android.com/studio/publish/app-signing).
3. Install a trusted JDK 21 (or Android Studio's JDK). Create an upload keystore **outside this repository**, only if you confirmed no existing key must be reused. In PowerShell, these commands prompt for passwords rather than putting them in shell history:

```powershell
$uploadDirectory = Join-Path $env:USERPROFILE 'PHATBOT-private-signing'
New-Item -ItemType Directory -Force -Path $uploadDirectory | Out-Null
keytool -genkeypair -v -keystore "$uploadDirectory\phatbot-upload.jks" -storetype JKS -alias phatbot-upload -keyalg RSA -keysize 2048 -validity 10000
```

Choose a strong password, record it in your password manager and keep encrypted backups of the keystore. Press Enter at the key-password prompt to use the store password for the key as well. Enter your own certificate owner/organization details. Do not share the keystore/password in chat, issues, PRs or screenshots.

4. In GitHub → repository Settings → Environments, create `android-release`. Configure required reviewers (where supported) and restrict it to reviewed release refs, normally `main`. A workflow on another branch must never gain the upload key just because it requests this environment. Review build scripts/dependencies before approval.
5. Add these four **environment secrets** inside `android-release` (repository secrets also resolve, but environment-scoped secrets are preferred):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the existing/new upload JKS |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `phatbot-upload`, or your existing alias |
| `ANDROID_KEY_PASSWORD` | Password for that alias (same as store password if chosen above) |

Copy the encoding directly to the clipboard, paste only into the GitHub secret form, then clear the clipboard; Base64 is **not encryption**:

```powershell
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes("$uploadDirectory\phatbot-upload.jks")))
# After saving ANDROID_KEYSTORE_BASE64 in GitHub:
Set-Clipboard -Value ''
```

Optionally export the PUBLIC upload certificate if Play requests it:

```powershell
keytool -exportcert -rfc -keystore "$uploadDirectory\phatbot-upload.jks" -alias phatbot-upload -file "$uploadDirectory\phatbot-upload-certificate.pem"
```

No keys or secrets were created or configured by this task. The release job fails clearly when any required secret is absent. It decodes the JKS with restricted permissions under runner temporary storage, reads passwords only from environment variables, verifies the bundle signature against the upload key and removes the JKS in an `always()` step. The GitHub-hosted runner is ephemeral; no Gradle cache or signing files are uploaded. Never enable shell tracing or Gradle debug logging in the signing step.

## Make the AAB

After this PR is reviewed and merged, open Actions → **PHATBOT Google Play AAB** → Run workflow. Select the reviewed ref (normally `main`). The release job checks out that exact dispatch SHA and may require your environment approval. PR runs never access release secrets.

Download the run's artifact named `PHATBOT-Play-<versionName>-<versionCode>`. The ZIP contains only:

`PHATBOT-release-<versionName>-<versionCode>.aab`

It is copied from `android/app/build/outputs/bundle/release/app-release.aab`; retention is 14 days. Save the AAB and its run/commit provenance for your release records. AABs are uploaded to Play, not installed directly like an APK. There is no Play API/service-account secret and no automatic publishing.

## Version increments

`versionCode = 100000 + github.run_number` for this workflow; `versionName = package.json version + '-play.' + run_number` (for example `0.1.0-play.42`, code `100042`). PR checks may consume run numbers; gaps are harmless. Every new dispatch increases the code without editing product files. Reruns are deliberately rejected: choose **Run workflow** again, not Re-run jobs. Concurrent completion/upload order does not change code ordering: upload newer codes after older codes; discard an older pending bundle once a newer one is uploaded.

Keep the workflow filename/history intact. Before moving/recreating the workflow or if Play already has a code >= the generated one, review/increase the documented offset above the existing maximum. This task cannot inspect your Play history. Values are bounded by Play's maximum 2,100,000,000. [Android versioning](https://developer.android.com/studio/publish/versioning).

## Play Console follow-up (not submitted here)

- Confirm the developer account, identity verification, app ownership, stable package ID and signing choice; enroll Play App Signing after your review.
- Add Internal Testing testers/email list or Google Group, release notes and opt-in link; upload the signed AAB manually. Follow any account-specific testing/verification requirements shown by Console before a later production release.
- Complete Health apps/Health Connect declarations for the six retained read categories: steps, active calories, exercise, distance, heart rate and sleep. Eric approved removal of the unused Android weight/RHR/HRV requests. The tracked installer now includes rationale/privacy activities, Android 14+ permission-usage and onboarding aliases, and provider visibility. See the [Health Connect readiness audit and Console checklist](ANDROID_HEALTH_CONNECT_READINESS.md) for actual data uses, privacy review gaps and device tests.
- Review the live privacy policy (`https://app.phatbotfit.com/privacy`), in-app prominent disclosure/consent, health data use/storage/retention/deletion, account deletion URL and Data safety answers against actual PHATBOT/native/server behavior. Do not assume declaring data is only on-device: PHATBOT syncs canonical health data to its backend. This task does not fill forms or certify policy compliance.
- Prepare title/descriptions, support contact, high-resolution icon, feature graphic and real-device screenshots; verify the generated Android launcher icon/splash branding before release.
- Complete content rating, target audience, ads and app-access declarations; supply reviewer login/access instructions if requested. Check current target API and other device/policy requirements in Console; template target is SDK 36.
- Install through Internal Testing on actual Android 13 and Android 14+ devices; check startup/offline fallback, auth, Health Connect availability/permissions/revocation/resync and return to PHATBOT after consent. Existing debug installations may need removal before a Play-signed install because their signing certificates differ; protect any unsynced data first.

## Validation

Local commands: `node --test scripts/android/test-prepare.mjs`, `npm test -- --reporter=dot`, `npm run typecheck`, `git diff --check`. The new PR CI additionally compiles Android on Ubuntu/Java 21, verifies both Gradle variants and tests the missing-secret signing failure. No upload-key credentials are fabricated to make this check pass. A real signed artifact still requires Eric's setup above and a successful manual run, followed by Play's own upload validation.
