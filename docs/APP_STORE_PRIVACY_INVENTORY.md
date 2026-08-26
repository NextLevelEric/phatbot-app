# PHATBOT App Store Privacy Inventory

Last reviewed: August 26, 2026

This document is a working source of truth for App Store Connect privacy responses. Apple requires developers to disclose data collected by the app and by integrated third-party partners. Re-check this inventory if PHATBOT adds analytics, ads, payments, HealthKit, push notifications, location, contacts, or additional third-party SDKs.

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

PHATBOT currently handles training/fitness information, not clinical medical records. If Apple presents separate Health and Fitness choices, select **Fitness** unless a future feature begins collecting medical/clinical health data or HealthKit data that falls under another category.

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
- HealthKit data

Normal infrastructure may necessarily process network metadata such as IP addresses. Before submission, review the final iOS/native stack and third-party provider disclosures to determine whether any additional Apple privacy data type must be declared.

## Third-party service providers currently used

### Supabase
Used for authentication and database services. Processes account identifiers and PHATBOT application data required to operate the service.

### Vercel
Used to host the application and server routes. May process normal hosting/request logs and server diagnostic information required to operate the service.

### Resend
Used for transactional email such as athlete/coach invitations. Processes email addresses and email content necessary to deliver those messages.

## Data sharing inside PHATBOT

When an athlete establishes an active coach relationship, the coach can access training information and reports permitted by PHATBOT's authorization rules and can provide coach feedback. This is an app feature initiated through the athlete/coach relationship, not third-party advertising or cross-app tracking.

## Retention and deletion

PHATBOT retains account and training information while the account is active or as needed to operate the service. The app provides in-app permanent account deletion. Deleting the authentication account cascades through athlete-linked PHATBOT data, with additional deletion handling for user-created records that would otherwise become orphaned. Infrastructure-provider logs/backups may persist temporarily according to provider retention processes or legal requirements.

## App Store Connect working responses

When completing App Privacy:

1. Answer **Yes, we collect data from this app**.
2. Select at minimum: **Contact Info**, **Health & Fitness**, **User Content**, **Identifiers**, and **Diagnostics** using the specific subtypes described above.
3. For the current implementation, mark these data types as **not used for tracking**.
4. For account, training, content, and identifiers, treat them as **linked to the user's identity/account**.
5. Primary use is **App Functionality**. Email also supports account management / transactional communications.
6. Enter the production `/privacy` URL as the required Privacy Policy URL.
7. Optionally use the account/delete or privacy page as a Privacy Choices URL once PHATBOT has its final production domain.

## Final pre-submission re-check

Do not publish App Store privacy answers until the iOS wrapper is final. Re-check this inventory after packaging because adding a native crash SDK, analytics SDK, payment provider, HealthKit integration, push-notification service, or other native dependency may change the disclosures.
