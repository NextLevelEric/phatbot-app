# PHATBOT App Store Privacy Inventory

Last reviewed: September 1, 2026

This document is a working source of truth for App Store Connect privacy responses. Apple requires developers to disclose data collected by the app and by integrated third-party partners. Re-check this inventory if PHATBOT adds analytics, ads, payments, new HealthKit types, push notifications, location, contacts, or additional third-party SDKs.

## Current high-level answers

- Does PHATBOT collect data from the app? **Yes.**
- Does PHATBOT use data to track users across apps or websites owned by other companies? **No, based on the current implementation.**
- Does PHATBOT use workout data for third-party advertising? **No.**
- Does PHATBOT sell personal information? **No.**
- Is collected account/training data generally linked to the user's PHATBOT account? **Yes.**

## Data types to disclose

### Contact Info

**Email Address**
- Collected: Yes
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality, Account Management, Developer Communications / transactional invitation emails
- Examples: authentication email; coach invitation email; athlete invitation email

**Name**
- Collected: Yes, when provided as a display name / athlete name / coach identity
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality, Account Management

### Health & Fitness

**Fitness**
- Collected: Yes
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality
- Examples: exercises, workout templates, workout sessions, sets, weight lifted, repetitions, partial reps, timed-set durations, workout notes, training phase, workout history, progressive-overload scores, personal records, weekly scores, plateau/coaching signals, historical workout imports

**Health**
- Collected: Yes
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality
- Examples persisted to the PHATBOT account: daily step count and active energy; Apple Health workout identifier, activity type/name, start/end time, duration, distance, active energy, and average workout heart rate

For App Store Connect, select both applicable **Health** and **Fitness** data types. PHATBOT does not use this data for advertising or tracking.

#### Apple Health implementation detail

PHATBOT requests read-only access to these HealthKit types:

| HealthKit identifier/type | Access | Leaves device | Persistence and use |
| --- | --- | --- | --- |
| `HKQuantityTypeIdentifierStepCount` | Read | Yes | Daily totals are saved in `health_daily_metrics.steps`; a 14-day total is displayed locally. Used for daily activity history and trends. |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | Read | Yes | Daily totals are saved in `health_daily_metrics.active_energy_kcal`; workout totals are saved in `cardio_activities.active_energy_kcal`; a 14-day total is displayed locally. Used for activity and workout history. |
| `HKWorkoutType` | Read | Yes | Normalized workout ID, type/name, start/end time, and duration are saved in `cardio_activities`. Used for cardio/activity history. |
| `HKQuantityTypeIdentifierDistanceWalkingRunning` | Read | Yes, for walking/running/hiking workouts | Workout distance is saved in `cardio_activities.distance_meters`. Used for workout history. |
| `HKQuantityTypeIdentifierDistanceCycling` | Read | Yes, for cycling workouts | Workout distance is saved in `cardio_activities.distance_meters`. Used for workout history. |
| `HKQuantityTypeIdentifierHeartRate` | Read | Yes, as a workout average | Average workout heart rate is saved in `cardio_activities.average_heart_rate_bpm`. Used for workout history. |
| `HKQuantityTypeIdentifierRestingHeartRate` | Read | No | Latest value in the 14-day snapshot is displayed on device only; it is not uploaded or persisted in the PHATBOT account. |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | Read | No | Latest value in the 14-day snapshot is displayed on device only; it is not uploaded or persisted in the PHATBOT account. |

PHATBOT requests no HealthKit write types (`toShare` is empty), performs no HealthKit writes, and does not request or query `HKCategoryTypeIdentifierSleepAnalysis`. Synchronization is user-initiated on first connection and may run on the dashboard on that same device after the connection has been remembered. Apple Health access is optional; revoking permission stops future reads and synchronization.

### User Content

**Other User Content**
- Collected: Yes
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality
- Examples: free-form workout notes, exercise notes, coach feedback / transmissions, imported workout content

### Identifiers

**User ID**
- Collected: Yes
- Linked to user: Yes
- Tracking: No
- Primary purposes: App Functionality, Account Management
- PHATBOT uses Supabase Auth user identifiers internally to associate account, workout, coach, and scoring records.

### Diagnostics

**Other Diagnostic Data**
- Collected: Yes, when an application error is reported
- Linked to user: Potentially linkable in server operational context; answer conservatively as linked if App Store Connect asks
- Tracking: No
- Primary purposes: App Functionality / reliability
- Examples currently sent by the client error reporter: error source, message, digest, stack, application path, browser/user-agent string, and timestamp

If App Store Connect offers a more specific diagnostic category that better describes the final native build's behavior, use the most specific applicable category and keep this document updated.

## Data PHATBOT does NOT currently collect as an app feature

Based on the current implementation, do not select these unless the native wrapper or a newly added service changes the behavior:

- Precise Location
- Coarse Location as an intentional app feature
- Contacts / address book
- Photos or videos as persistent user data
- Audio data
- Browsing History
- Search History
- Advertising Data
- Payment Information
- Credit Information
- Other Financial Information
- Purchases, unless payments/subscriptions are added
- Sensitive Info such as race, ethnicity, religion, political opinions, sexual orientation, or biometric templates

Normal infrastructure may necessarily process network metadata such as IP addresses. Before submission, review the final iOS/native stack and third-party provider disclosures to determine whether any additional Apple privacy data type must be declared.

## Third-party service providers currently used

### Supabase
Used for authentication and database services. Processes account identifiers and PHATBOT application data required to operate the service.

### Vercel
Used to host the application and server routes. May process normal hosting/request logs and server diagnostic information required to operate the service.

### Resend
Used for transactional email such as athlete/coach invitations. Processes email addresses and email content necessary to deliver those messages.

## Data sharing inside PHATBOT

When an athlete establishes an active coach relationship, the coach can access training information and reports permitted by PHATBOT's authorization rules and can provide coach feedback. Apple Health-derived rows in `health_daily_metrics` and `cardio_activities` remain athlete-private and are not available to a coach merely because the relationship is active. This is an app feature initiated through the athlete/coach relationship, not third-party advertising or cross-app tracking.

## Retention and deletion

PHATBOT retains account and training information while the account is active or as needed to operate the service. The app provides in-app permanent account deletion. Deleting the authentication account cascades through athlete-linked PHATBOT data, including `health_daily_metrics` and `cardio_activities`, with additional deletion handling for user-created records that would otherwise become orphaned. Revoking Apple Health permission stops future synchronization but does not delete previously persisted PHATBOT rows. Infrastructure-provider logs/backups may persist temporarily according to provider retention processes or legal requirements.

## App Store Connect working responses

When completing App Privacy:

1. Answer **Yes, we collect data from this app**.
2. Select at minimum: **Contact Info**, both applicable **Health** and **Fitness** data types under Health & Fitness, **User Content**, **Identifiers**, and **Diagnostics** using the specific subtypes described above.
3. For the current implementation, mark these data types as **not used for tracking**.
4. For account, training, content, and identifiers, treat them as **linked to the user's identity/account**.
5. Primary use is **App Functionality**. Email also supports account management / transactional communications.
6. Enter the production `/privacy` URL as the required Privacy Policy URL.
7. Optionally use the account/delete or privacy page as a Privacy Choices URL once PHATBOT has its final production domain.

## Final pre-submission re-check

Do not publish App Store privacy answers until the iOS wrapper is final. Re-check this inventory after packaging because adding a native crash SDK, analytics SDK, payment provider, new HealthKit types, push-notification service, or other native dependency may change the disclosures.
