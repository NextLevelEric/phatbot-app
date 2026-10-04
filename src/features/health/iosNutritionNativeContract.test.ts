import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const swift = readFileSync(new URL("../../../ios/App/App/HealthKitManager.swift", import.meta.url), "utf8");

describe("iOS nutrition native contract", () => {
  it("requests the four nutrition HealthKit read types", () => {
    for (const token of [".dietaryEnergyConsumed", ".dietaryProtein", ".dietaryCarbohydrates", ".dietaryFatTotal"]) {
      expect(swift).toContain(token);
    }
  });

  it("builds nutrition series using per-day provenance", () => {
    expect(swift).toContain("NutritionSeries(values: [:], originsByDay: [:])");
    expect(swift).not.toContain("NutritionSeries(values: [:], origins: [])");
    expect(swift).toContain('assign("nutritionDaily", v)');
  });
});
