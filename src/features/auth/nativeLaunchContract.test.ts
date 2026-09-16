import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../../capacitor.config";

describe("native launch packaging contract (not a native runtime test)", () => {
  it("ships a dependency-free fallback with an in-shell production retry", () => {
    expect(config.server?.url).toBe("https://app.phatbotfit.com");
    expect(config.server?.cleartext).toBe(false);
    expect(config.server?.errorPath).toBe("index.html");
    const fallback = readFileSync(`${config.webDir}/${config.server?.errorPath}`, "utf8");
    expect(fallback).toContain('href="https://app.phatbotfit.com/"');
    expect(fallback).toContain("Try Again");
    expect(fallback).not.toMatch(/<script|<link|<img|sb_secret_|service_role/i);
  });
  it("preserves Capacitor's delegate and native registration while bounding navigation", () => {
    const source = readFileSync("ios/App/App/SceneDelegate.swift", "utf8");
    expect(source).toContain("withTimeInterval: 20");
    expect(source).toContain("webView.stopLoading()");
    expect(source).toContain("config.errorPathURL");
    expect(source).not.toContain("navigationDelegate =");
    expect(source).toContain("registerPluginInstance(HealthKitPlugin())");
    expect(source).not.toContain("requestAuthorization");
  });
});
