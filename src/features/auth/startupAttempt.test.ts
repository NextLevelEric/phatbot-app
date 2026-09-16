import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startStartupAttempt, STARTUP_TIMEOUT_MS, StartupTimeoutError } from "./startupAttempt";

describe("bounded startup attempt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts a stalled read and ignores its eventual success", async () => {
    let finish!: (value: string) => void;
    let signal!: AbortSignal;
    const ready = vi.fn(), failed = vi.fn();
    startStartupAttempt((s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); }, ready, failed);
    await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS);
    expect(signal.aborted).toBe(true);
    expect(failed).toHaveBeenCalledExactlyOnceWith(expect.any(StartupTimeoutError));
    finish("late data");
    await vi.advanceTimersByTimeAsync(0);
    expect(ready).not.toHaveBeenCalled();
  });

  it("cancels on unmount before issuing a request", async () => {
    const load = vi.fn(), ready = vi.fn(), failed = vi.fn();
    startStartupAttempt(load, ready, failed)();
    await vi.runAllTimersAsync();
    expect(load).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("reports rejection once and permits a separate successful retry", async () => {
    const ready = vi.fn(), failed = vi.fn();
    startStartupAttempt(async () => { throw new Error("offline"); }, ready, failed);
    await vi.runAllTimersAsync();
    expect(failed).toHaveBeenCalledTimes(1);
    startStartupAttempt(async () => "restored", ready, failed);
    await vi.runAllTimersAsync();
    expect(ready).toHaveBeenCalledExactlyOnceWith("restored");
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
