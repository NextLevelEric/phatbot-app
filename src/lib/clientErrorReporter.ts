type ClientErrorPayload = {
  source: string;
  message: string;
  digest?: string | null;
  stack?: string | null;
  path?: string | null;
  userAgent?: string | null;
  timestamp: string;
};

export function reportClientError(source: string, error: Error & { digest?: string }) {
  if (typeof window === "undefined") return;

  const payload: ClientErrorPayload = {
    source,
    message: error.message || "Unknown client error",
    digest: error.digest ?? null,
    stack: error.stack ?? null,
    path: window.location.pathname,
    userAgent: window.navigator.userAgent,
    timestamp: new Date().toISOString(),
  };

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch (reportingError) {
    console.error("PHATBOT error reporter failed", reportingError);
  }
}
