export const STARTUP_TIMEOUT_MS = 15_000;

export class StartupTimeoutError extends Error {
  constructor() {
    super("Startup timed out");
    this.name = "StartupTimeoutError";
  }
}

/** Bound one read-only startup attempt. Cancellation also suppresses late results
 * from auth operations which do not accept an AbortSignal. Never retry mutations.
 */
export function startStartupAttempt<T>(
  load: (signal: AbortSignal) => Promise<T>,
  ready: (value: T) => void,
  failed: (error: unknown) => void,
) {
  const controller = new AbortController();
  let active = true;
  const timer = setTimeout(() => {
    if (!active) return;
    active = false;
    controller.abort();
    failed(new StartupTimeoutError());
  }, STARTUP_TIMEOUT_MS);

  void Promise.resolve().then(() => {
    if (!active) return;
    return load(controller.signal);
  }).then((value) => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    ready(value as T);
  }, (error: unknown) => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    controller.abort();
    failed(error);
  });

  return () => {
    active = false;
    clearTimeout(timer);
    controller.abort();
  };
}
