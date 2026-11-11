import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Board from "@/components/TrainTogetherCompetitionBoard";
import { readRoomStandings } from "./trainTogetherStandings";

describe("Train Together RPC failures", () => {
  it("distinguishes the production database error from a successful empty board", async () => {
    expect(await readRoomStandings(async () => ({ data: null, error: { code: "42702", message: 'column reference "athlete_user_id" is ambiguous' } })))
      .toEqual({ rows: [], failed: true });
    expect(await readRoomStandings(async () => ({ data: [], error: null })))
      .toEqual({ rows: [], failed: false });
  });
  it("handles network rejection and recovers on retry", async () => {
    expect((await readRoomStandings(async () => { throw new Error("Failed to fetch"); })).failed).toBe(true);
    const rows = [{ athlete_user_id: "member", score: 75 }];
    expect(await readRoomStandings(async () => ({ data: rows, error: null }))).toEqual({ rows, failed: false });
  });
  it("shows an actionable alert instead of an empty board or stale score", () => {
    const html = renderToStaticMarkup(<Board competition="eager_beaver" rows={[]} me={null} failed onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your saved workout data is safe");
    expect(html).toContain("Retry standings");
    expect(html).not.toContain("Log a comparable exercise to start");
    expect(html).not.toContain("42702");
    expect(renderToStaticMarkup(<Board competition="eager_beaver" rows={[]} me={null} />)).toContain("Log a comparable exercise to start");
  });
  it("wires independent RPC errors and retry into both live and completed views", () => {
    for (const name of ["TrainTogetherCard", "TrainTogetherReportCard"]) {
      const source = readFileSync(`src/components/${name}.tsx`, "utf8");
      expect(source.match(/readRoomStandings\(\(\) =>/g)).toHaveLength(2);
      expect(source).toContain("failed={beastError}");
      expect(source).toContain("failed={eagerError}");
      expect(source.match(/onRetry=/g)).toHaveLength(2);
    }
    expect(readFileSync("src/components/TrainTogetherReportCard.tsx", "utf8")).toContain("!beastError && !eagerError");
  });
});
