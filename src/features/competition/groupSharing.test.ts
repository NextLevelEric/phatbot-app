import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const groups = readFileSync("src/app/groups/page.tsx", "utf8");
const join = readFileSync("src/app/groups/join/[code]/page.tsx", "utf8");
const auth = readFileSync("src/app/auth/page.tsx", "utf8");

describe("group sharing", () => {
  it("uses one canonical direct join URL for share and QR", () => {
    expect(groups).toContain("https://app.phatbotfit.com");
    expect(groups).toContain("/groups/join/${activeGroup.join_code}");
    expect(groups).toContain("navigator.share");
    expect(groups).toContain("api.qrserver.com");
    expect(groups).toContain("COPY LINK");
  });

  it("joins a group directly from the shared code", () => {
    expect(join).toContain('rpc("join_athlete_group"');
    expect(join).toContain("p_join_code: code");
    expect(join).toContain("/groups?group=${data}");
  });

  it("preserves a group invite through authentication", () => {
    expect(join).toContain("/auth?next=");
    expect(auth).toContain('search.get("next")');
    expect(auth).toContain('nextPath.startsWith("/") && !nextPath.startsWith("//")');
    expect(auth).toContain("window.location.href = safeNext");
  });
});
