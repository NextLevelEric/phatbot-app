import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/AutomaticHealthSyncAgent.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("automatic native health sync", () => {
  it("is mounted globally and refreshes the shared 14-day sync authority", () => {
    expect(layout).toContain("<AutomaticHealthSyncAgent />");
    expect(source).toContain("await syncNativeHealth(14)");
  });

  it("only runs on native health providers and visible foreground state", () => {
    expect(source).toContain('getNativeHealthProvider() === "none"');
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).toContain('visibilitychange');
    expect(source).toContain('pageshow');
  });

  it("throttles automatic attempts without requesting health authorization", () => {
    expect(source).toContain("15 * 60 * 1000");
    expect(source).toContain("localStorage");
    expect(source).not.toContain("requestNativeHealthAccess");
  });

  it("keeps automatic failures non-blocking", () => {
    expect(source).toMatch(/try\s*{[\s\S]*syncNativeHealth\(14\)[\s\S]*}\s*catch\s*{/);
  });
});
