import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260912143627_bodyweight_measurements.sql"),
  "utf8",
).toLowerCase();

describe("bodyweight measurement schema contract", () => {
  it("creates append-only longitudinal measurements with canonical kilograms", () => {
    expect(migration).toContain("create table public.bodyweight_measurements");
    expect(migration).toContain("athlete_user_id uuid not null");
    expect(migration).toContain("weight_value numeric(6,2) not null");
    expect(migration).toContain("unit text not null");
    expect(migration).toContain("weight_kg numeric(7,3) generated always");
    expect(migration).toContain("measured_at timestamptz not null default now()");
    expect(migration).toContain("source text not null default 'manual'");
    expect(migration).toContain("created_at timestamptz not null default now()");
    expect(migration).not.toMatch(/unique\s*\([^)]*(measured_at|created_at)/);
  });

  it("enforces the same reasonable unit ranges as the client", () => {
    expect(migration).toContain("unit = 'lb' and weight_value between 40 and 1000");
    expect(migration).toContain("unit = 'kg' and weight_value between 18 and 454");
  });

  it("allows only authenticated owners to select and insert", () => {
    expect(migration).toContain("alter table public.bodyweight_measurements enable row level security");
    expect(migration).toContain("revoke all on table public.bodyweight_measurements from anon, authenticated");
    expect(migration).toContain("grant select, insert on table public.bodyweight_measurements to authenticated");
    expect(migration).toMatch(/bodyweight_measurements_select_own[\s\S]*?for select[\s\S]*?to authenticated/);
    expect(migration).toMatch(/bodyweight_measurements_insert_own[\s\S]*?for insert[\s\S]*?to authenticated/);
    expect(migration.match(/\(select auth\.uid\(\)\) is not null/g)).toHaveLength(2);
    expect(migration.match(/\(select auth\.uid\(\)\) = athlete_user_id/g)).toHaveLength(2);
    expect(migration).not.toContain("can_access_athlete");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain("grant delete");
  });
});
