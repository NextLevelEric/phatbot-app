import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("HealthKit V1 release safeguards", () => {
  const manager = read("../../../ios/App/App/HealthKitManager.swift");
  const infoPlist = read("../../../ios/App/App/Info.plist");
  const dashboard = read("../../components/RebuildDashboardStatus.tsx");

  it("requests only read access and does not request or query sleep", () => {
    expect(manager).toContain("requestAuthorization(toShare: [], read: readTypes)");
    expect(manager).not.toContain("sleepAnalysis");
    expect(manager).not.toContain("fetchSleep");
    expect(manager).not.toMatch(/\bstore\.save\s*\(/);
    expect(infoPlist).not.toContain("NSHealthUpdateUsageDescription");
    expect(infoPlist).toContain("steps, active energy, workouts, workout distance and heart rate, resting heart rate, and HRV");
    expect(infoPlist).toContain("saved to your PHATBOT account");
  });

  it("keeps Apple Health optional and handles a denied request without blocking the app", () => {
    expect(dashboard).toContain('if (Capacitor.getPlatform() !== "ios") return;');
    expect(dashboard).toContain("if (!authorization.authorized) throw new Error");
    expect(dashboard).toContain('setHealthError(error instanceof Error ? error.message : "PHATBOT could not sync Apple Health.")');
    expect(dashboard).toContain('localStorage.getItem(HEALTH_CONNECTED_KEY) === "1"');
    expect(dashboard).toContain("Apple Health is optional, and PHATBOT never writes to Apple Health.");
    expect(dashboard).not.toContain("Apple Health Beta");
    expect(dashboard).not.toContain('"TEST"');
  });

  it("preserves activity sync while preventing denied reads from overwriting prior daily totals", () => {
    expect(manager).toContain("fetchDailyMetrics(start: start, end: end)");
    expect(manager).toContain("fetchWorkouts(start: start, end: end)");
    expect(dashboard).toContain('.from("cardio_activities").upsert');
    expect(dashboard).toContain('.from("health_daily_metrics").upsert');
    expect(dashboard).toContain("(day.steps ?? 0) > 0 || (day.activeEnergyKcal ?? 0) > 0");
  });

  it("limits HealthKit-backed SELECT access to the owning athlete", () => {
    const migration = read("../../../supabase/migrations/20260901180242_make_healthkit_records_athlete_private.sql");

    expect(migration.match(/for select/g)).toHaveLength(2);
    expect(migration.match(/to authenticated/g)).toHaveLength(2);
    expect(migration.match(/using \(\(select auth\.uid\(\)\) = athlete_user_id\);/g)).toHaveLength(2);
    expect(migration).not.toContain("can_access_athlete");
  });

  it("retains cascading deletion for both HealthKit-backed tables", () => {
    const schema = read("../../../supabase/migrations/20260829_110_healthkit_activity_history.sql");
    const deletionRoute = read("../../app/api/account/delete/route.ts");

    expect(schema.match(/references public\.athlete_profiles\(user_id\) on delete cascade/g)).toHaveLength(2);
    expect(deletionRoute).toContain("admin.auth.admin.deleteUser(user.id)");
  });

  it("keeps public privacy and release documentation aligned with V1", () => {
    const privacyPage = read("../../app/privacy/page.tsx");
    const inventory = read("../../../docs/APP_STORE_PRIVACY_INVENTORY.md");
    const releaseChecklist = read("../../../docs/PHATBOT_V1_RELEASE_CHECKLIST.md");

    expect(privacyPage).toContain("does not request permission to write to Apple Health");
    expect(privacyPage).toContain("advertising, cross-app tracking, or sale to third parties");
    expect(privacyPage).toContain("Revoking access stops PHATBOT from reading and synchronizing future Apple Health data");
    expect(privacyPage).toContain("including saved Apple Health-derived daily metrics and cardio activities");
    expect(inventory).toContain("select both applicable **Health** and **Fitness** data types");
    expect(inventory).not.toMatch(/^\s*- HealthKit data\s*$/m);
    expect(releaseChecklist).not.toContain("- Apple Health / HealthKit integration");
  });
});
