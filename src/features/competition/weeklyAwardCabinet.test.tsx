import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfficialTrophyCabinet, { type CadenceAwardCount } from "@/components/OfficialTrophyCabinet";

describe("official cabinet cadence rendering", () => {
  it("preserves mixed daily/weekly counts and shows their distinct hardware", () => {
    const counts = { beast: 5 };
    const cadenceCounts: CadenceAwardCount[] = [
      { competition: "beast", cadence: "daily", count: 2 },
      { competition: "beast", cadence: "weekly", count: 3 },
    ];
    const before = JSON.stringify({ counts, cadenceCounts });
    const html = renderToStaticMarkup(<OfficialTrophyCabinet counts={counts} cadenceCounts={cadenceCounts} />);
    expect(html).toContain("beast-medallion.png");
    expect(html).toContain("beast-of-the-week-platinum.png");
    expect(html).toContain("2 wins");
    expect(html).toContain("3 wins");
    expect(html).toContain("object-contain");
    expect(cadenceCounts.reduce((sum, award) => sum + award.count, 0)).toBe(counts.beast);
    expect(JSON.stringify({ counts, cadenceCounts })).toBe(before);
  });
  it("retains old aggregate responses without mislabeling them as weekly", () => {
    const html = renderToStaticMarkup(<OfficialTrophyCabinet counts={{ beast: 5 }} />);
    expect(html).toContain("5 wins");
    expect(html).not.toContain("platinum.png");
  });
  it("does not turn social participation into official hardware", () => {
    const html = renderToStaticMarkup(<OfficialTrophyCabinet counts={{}} cadenceCounts={[]} />);
    expect(html).toContain("No official PHATBOT hardware yet");
    expect(html).not.toContain("<img");
  });
});
