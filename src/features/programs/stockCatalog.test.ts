import { describe, expect, it } from "vitest";
import {
  buildStockCatalog,
  stockCatalogDescription,
  type StockCatalogDayRow,
  type StockCatalogVersionRow,
} from "./stockCatalog";

const family = (slug: string, name: string) => ({
  id: `family-${slug}`,
  name,
  slug,
  source_type: "phatbot_stock",
  visibility: "stock_catalog",
  status: "active",
});

const version = (slug: string, name: string, description: string, dayCount: number): {
  version: StockCatalogVersionRow;
  days: StockCatalogDayRow[];
} => ({
  version: {
    id: `version-${slug}`,
    program_family_id: `family-${slug}`,
    name,
    description,
    version_number: 1,
    program_families: family(slug, name),
  },
  days: Array.from({ length: dayCount }, (_, index) => ({
    id: `day-${slug}-${index + 1}`,
    program_id: `version-${slug}`,
    day_number: index + 1,
    name: `Workout ${index + 1}`,
  })),
});

describe("stock program catalog", () => {
  it("returns every eligible published stock-program projection, including Inaugural Eager Beaver", () => {
    const fixtures = [
      version("first-day-in-the-gym", "First Day in the Gym", "Beginner four-workout gym rotation.", 4),
      version("full-body", "Full Body", "Simple repeating full-body A/B rotation.", 2),
      version("inaugural-eager-beaver", "Inaugural Eager Beaver", "Legacy PHATBOT six-workout rotation.", 6),
      version("strength-as-a-skill", "Strength as a Skill", "Advanced six-workout strength rotation.", 6),
      version("smooth-bear-current", "The Smooth Bear's Current Program", "Current Smooth Bear rotation.", 6),
    ];

    const catalog = buildStockCatalog(fixtures.map((fixture) => fixture.version), fixtures.flatMap((fixture) => fixture.days));

    expect(catalog).toHaveLength(5);
    expect(catalog.map((program) => program.familyName)).toEqual([
      "First Day in the Gym",
      "Full Body",
      "Inaugural Eager Beaver",
      "Strength as a Skill",
      "The Smooth Bear's Current Program",
    ]);
    expect(catalog.find((program) => program.familySlug === "inaugural-eager-beaver")?.days).toHaveLength(6);
  });

  it("excludes families that are not active stock-catalog entries", () => {
    const fixture = version("hidden", "Hidden", "Hidden program.", 1);
    const hidden = {
      ...fixture.version,
      program_families: { ...family("hidden", "Hidden"), status: "retired" },
    };
    expect(buildStockCatalog([hidden], fixture.days)).toEqual([]);
  });

  it("uses the approved factual Strength as a Skill copy without inventing an advanced classification", () => {
    expect(stockCatalogDescription({
      familySlug: "strength-as-a-skill",
      description: "Advanced six-workout strength rotation.",
    })).toBe("Six-workout strength-focused rotation.");
    expect(stockCatalogDescription({
      familySlug: "first-day-in-the-gym",
      description: "Beginner four-workout gym rotation.",
    })).toBe("Beginner four-workout gym rotation.");
  });
});
