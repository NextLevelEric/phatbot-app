import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_TIMEOUT_MS } from "./startupAttempt";

// Exercise the actual Home effect and rendered branches without a DOM dependency.
// Native WKWebView and full React lifecycle behavior still require device QA.
const harness = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  effect: undefined as undefined | (() => undefined | (() => void)),
  client: undefined as unknown,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useEffect: (effect: () => undefined | (() => void)) => { harness.effect = effect; },
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseBrowserClient: () => {
  if (!harness.client) throw new Error("missing configuration");
  return harness.client;
} }));
vi.mock("@/components/RebuildDashboardStatus", () => ({ RebuildDashboardStatus: () => null }));
vi.mock("@/components/BodyweightQuickLog", () => ({ default: () => null }));
vi.mock("@/components/AthleteProgramHomeCard", () => ({ default: () => null }));
import HomePage from "../../app/page";

type Result = { data: unknown; error: unknown };
const session = { user: { id: "test-athlete" } };
let authEvent: (event: string, session: unknown) => void;
let cleanup: undefined | (() => void);
let queryResult: (table: string) => Promise<Result>;
let signals: AbortSignal[];
let getSession: ReturnType<typeof vi.fn>;
let from: ReturnType<typeof vi.fn>;
const location = { replace: vi.fn(), reload: vi.fn() };

function render() { harness.cursor = 0; return HomePage(); }
function text() { return JSON.stringify(render(), (key, value) => key === "type" || key === "_owner" ? undefined : value); }
function mount() { render(); cleanup = harness.effect?.(); }
async function flush() { await vi.advanceTimersByTimeAsync(0); }

beforeEach(() => {
  vi.useFakeTimers();
  harness.states = []; signals = []; cleanup = undefined;
  location.replace.mockClear(); location.reload.mockClear();
  vi.stubGlobal("window", { location });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  queryResult = async (table) => ({ data: table === "profiles" ? { display_name: "Test Athlete" } : null, error: null });
  getSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
  from = vi.fn((table: string) => {
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query,
      limit: () => query, single: () => query, maybeSingle: () => query,
      abortSignal: (signal: AbortSignal) => { signals.push(signal); return query; },
      then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => queryResult(table).then(resolve, reject),
    };
    return query;
  });
  harness.client = { from, auth: { getSession, onAuthStateChange: (callback: typeof authEvent) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  } } };
});
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Home startup", () => {
  it("routes a fresh installation to auth without profile/data reads", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount(); await flush();
    expect(location.replace).toHaveBeenCalledExactlyOnceWith("/auth");
    expect(from).not.toHaveBeenCalled();
  });
  it("loads Home with an existing session and no HealthKit dependency", async () => {
    mount(); await flush();
    expect(text()).toContain("Ready, Test?");
    expect(text()).not.toContain("Loading your training data");
    expect(signals).toHaveLength(7);
    authEvent("INITIAL_SESSION", session); await flush();
    expect(getSession).toHaveBeenCalledTimes(1);
  });
  it("routes an invalid session cleared by the SDK to auth", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    mount(); await flush();
    expect(location.replace).toHaveBeenCalledWith("/auth");
  });
  it("shows recovery UI on a session error instead of a redirect loop", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: new Error("invalid refresh token") });
    mount(); await flush();
    expect(text()).toContain("Try Again");
    expect(location.replace).not.toHaveBeenCalled();
  });
  it("bounds a stalled session and ignores late authentication", async () => {
    let finish!: (value: unknown) => void;
    getSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
    expect(text()).toContain("Try Again");
    finish({ data: { session }, error: null }); await flush();
    expect(from).not.toHaveBeenCalled();
    expect(text()).toContain("Try Again");
  });
  it("bounds even a stalled optional profile read and aborts data requests", async () => {
    queryResult = (table) => table === "profiles" ? new Promise(() => {}) : Promise.resolve({ data: null, error: null });
    mount(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
    expect(text()).toContain("Try Again");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("allows Home without a profile when a profile read is denied", async () => {
    queryResult = async (table) => ({ data: null, error: table === "profiles" ? { code: "42501" } : null });
    mount(); await flush();
    expect(text()).toContain("Ready to train?");
    expect(console.warn).toHaveBeenCalled();
  });
  it("shows recoverable error for offline/critical query failure and succeeds on remount", async () => {
    queryResult = async () => { throw new Error("offline"); };
    mount(); await flush();
    expect(text()).toContain("Try Again");
    expect(text()).toContain("Your data has not been changed");
    cleanup?.(); harness.states = [];
    queryResult = async () => ({ data: null, error: null });
    mount(); await flush();
    expect(text()).toContain("Ready to train?");
  });
  it("cancels pending loading on logout and does not restore stale Home", async () => {
    let finish!: (value: unknown) => void;
    getSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mount(); await flush(); authEvent("SIGNED_OUT", null);
    finish({ data: { session }, error: null }); await flush();
    expect(location.replace).toHaveBeenCalledWith("/auth");
    expect(from).not.toHaveBeenCalled();
  });
  it("shows recovery UI when public configuration is missing", () => {
    harness.client = undefined; mount();
    expect(text()).toContain("Try Again");
    expect(text()).toContain("couldn't start");
  });
});
