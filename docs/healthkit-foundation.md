# PHATBOT HealthKit Foundation

Branch: `feature/healthkit-foundation`

## Goal
Start read-only Apple Health / Apple Watch data collection without changing PHATBOT scoring yet.

## First data set
- Resting heart rate
- Heart-rate variability (SDNN)
- Active energy burned
- Step count
- Workouts and duration
- Sleep samples
- Heart rate type is included in authorization for the next exercise-heart-rate query step

## Native bridge
The iOS target now includes HealthKit usage text, a HealthKit entitlement, `HealthKitManager.swift`, and a Capacitor bridge named `HealthKit`.

JavaScript can call the bridge through `src/lib/healthkit.ts`:
- `requestHealthKitAccess()`
- `getHealthKitSnapshot(days)`

## Current limitation
This foundation does not yet persist HealthKit data to Supabase or expose a user-facing Health screen. It also does not yet aggregate exercise heart-rate samples by PHATBOT workout. Those are the next steps after the native build compiles and the permission prompt is verified on a physical iPhone.

## Safety / product rule
Health data is read-only in this phase and must not alter PO scores or coaching recommendations until real-world data has been collected and reviewed.
