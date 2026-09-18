import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_TIMEOUT_MS } from "@/features/auth/startupAttempt";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  effect: undefined as undefined | (() => () => void),
  client: undefined as unknown,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useEffect: (effect: () => () => void) => { harness.effect = effect; },
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseBrowserClient: () => {
  if (!harness.client) throw new Error("missing config");
  return harness.client;
} }));
import WeeklyReportReadyCard from "@/components/WeeklyReportReadyCard";

const report = { id: "report", finalized_at: "2026-09-20T16:30:00Z", report_payload: { summary: { headline: "A week of progress" } } };
let result: () => Promise<{ data: unknown; error: unknown }>;
let cleanup: (() => void) | undefined;
let signal: AbortSignal;
const filter = vi.fn(), from = vi.fn();
function render() { harness.cursor = 0; return WeeklyReportReadyCard({ athleteUserId: "athlete" }); }
function mount() { render(); cleanup = harness.effect?.(); }
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T17:00:00Z"));
  harness.states = []; cleanup = undefined; filter.mockClear(); from.mockReset();
  result = async () => ({ data: report, error: null });
  const query = {
    abortSignal: (value: AbortSignal) => { signal = value; return query; },
    select: () => query, eq: (key: string, value: string) => { filter(key, value); return query; },
    gte: (key: string, value: string) => { filter(key, value); return query; },
    order: () => query, limit: () => query, maybeSingle: () => query,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
  };
  from.mockReturnValue(query); harness.client = { from };
});
afterEach(() => { cleanup?.(); vi.useRealTimers(); });

describe("Sunday report integration with recovered Home", () => {
  it("mounts below Resume and Next Workout only after startup's loading/error gates", () => {
    const home = readFileSync("src/app/page.tsx", "utf8");
    const placement = home.indexOf("<WeeklyReportReadyCard");
    expect(placement).toBeGreaterThan(home.indexOf("<AthleteProgramHomeCard"));
    expect(home.indexOf("<AthleteProgramHomeCard")).toBeGreaterThan(home.indexOf("Resume PHATBOT Train"));
    expect(home.indexOf("if (loading)")).toBeLessThan(placement);
    expect(home.indexOf("if (loadError)")).toBeLessThan(placement);
    expect(home).toContain("cancelLoad = startStartupAttempt");
    expect(home).not.toContain('from("weekly_progress_reports")');
    expect(home).not.toContain("finalize_my_weekly_progress_report");
  });
  it("reads only this athlete's recent report and renders the existing card", async () => {
    mount(); expect(render()).toBeNull(); await flush();
    expect(from).toHaveBeenCalledExactlyOnceWith("weekly_progress_reports");
    expect(filter).toHaveBeenCalledWith("athlete_user_id", "athlete");
    expect(filter).toHaveBeenCalledWith("finalized_at", "2026-09-17T17:00:00.000Z");
    expect(JSON.stringify(render(), (key, value) => key === "type" || key === "_owner" ? undefined : value)).toContain("A week of progress");
  });
  it("removes the card at 72 hours even if Home stays mounted", async () => {
    mount(); await flush();
    await vi.advanceTimersByTimeAsync(71.5 * 60 * 60 * 1000);
    expect(render()).toBeNull();
  });
  it.each([null, { ...report, finalized_at: "2026-09-16T16:30:00Z" }])("keeps empty/expired results out of Home", async (data) => {
    result = async () => ({ data, error: null }); mount(); await flush(); expect(render()).toBeNull();
  });
  it("bounds a stalled secondary read and ignores late results", async () => {
    let finish!: (value: { data: unknown; error: unknown }) => void;
    result = () => new Promise(resolve => { finish = resolve; });
    mount(); await flush(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
    expect(signal.aborted).toBe(true); expect(render()).toBeNull();
    finish({ data: report, error: null }); await flush(); expect(render()).toBeNull();
  });
  it.each(["rejected", "missing table", "missing configuration"])("hides a %s failure without disrupting Home", async (failure) => {
    if (failure === "missing configuration") harness.client = undefined;
    else result = async () => {
      if (failure === "rejected") throw new Error("offline");
      return { data: null, error: { code: "42P01" } };
    };
    mount(); await flush(); expect(render()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels the card read on unmount without displaying late data", async () => {
    let finish!: (value: { data: unknown; error: unknown }) => void;
    result = () => new Promise(resolve => { finish = resolve; });
    mount(); await flush(); cleanup?.();
    finish({ data: report, error: null }); await flush();
    expect(signal.aborted).toBe(true); expect(render()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});
