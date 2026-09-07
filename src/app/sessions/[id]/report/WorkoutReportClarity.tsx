"use client";

import { useEffect, useState } from "react";

type Metrics = { po: number | null; volume: number | null };

function parseMetric(label: string) {
  const nodes = Array.from(document.querySelectorAll("p"));
  const heading = nodes.find((node) => node.textContent?.trim() === label);
  const value = heading?.nextElementSibling?.textContent?.trim() ?? "";
  if (!value || value === "BASELINE" || value === "N/A") return null;
  const parsed = Number(value.replace("%", "").replace("+", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function interpretation({ po, volume }: Metrics) {
  if (po === null || volume === null) {
    return {
      title: "Comparison still building.",
      body: "PHATBOT needs enough comparable training history to interpret set progression and total training volume together.",
    };
  }
  if (po >= 70 && volume < 0) {
    return {
      title: "Strong progression, lower volume.",
      body: "You improved the quality of most comparable sets, but completed less total comparable training volume than last time. Those results can both be true: PO rewards how your sets progressed, while volume measures the total work performed.",
    };
  }
  if (po >= 70 && volume >= 0) {
    return {
      title: "Strong progression and more work.",
      body: "Your comparable sets progressed well and your total comparable training volume also increased. PHATBOT sees improvement in both set quality and overall workload.",
    };
  }
  if (po < 70 && volume > 0) {
    return {
      title: "More work, mixed progression.",
      body: "Your total comparable training volume increased, but fewer individual sets qualified as progression. More work does not automatically mean better set-by-set performance.",
    };
  }
  if (po < 70 && volume < 0) {
    return {
      title: "A lighter progression day.",
      body: "Both set-by-set progression and total comparable volume were lower than your previous reference. Recovery, exercise execution, or an intentionally lighter session can all affect this result.",
    };
  }
  return {
    title: "Mixed training signal.",
    body: "Your set-by-set progression and total workload are measuring different parts of the workout. Read them together rather than treating either number as the whole result.",
  };
}

export default function WorkoutReportClarity() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const read = () => {
      const po = parseMetric("Progressive Overload Score");
      const volume = parseMetric("Training Volume vs Last Workout");
      if (po !== null || volume !== null) setMetrics({ po, volume });
    };
    read();
    const timer = window.setTimeout(read, 250);
    return () => window.clearTimeout(timer);
  }, []);

  if (!metrics) return null;
  const copy = interpretation(metrics);

  return (
    <section className="mx-auto mb-6 w-full max-w-2xl px-4 sm:px-6" data-phatbot-report-clarity>
      <div className="rounded-2xl border border-[#ff0032]/30 bg-[#ff0032]/5 p-5">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT INTERPRETATION</p>
        <h2 className="mt-2 text-xl font-black">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{copy.body}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-zinc-800 p-3">
            <p className="font-black text-zinc-200">PO SCORE</p>
            <p className="mt-1 leading-5 text-zinc-500">How successfully your comparable working sets progressed.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 p-3">
            <p className="font-black text-zinc-200">TRAINING VOLUME</p>
            <p className="mt-1 leading-5 text-zinc-500">How much total comparable work you performed versus the prior workout.</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-5 text-zinc-500">Same locked PHATBOT scoring formulas. This card only explains how the two measurements fit together.</p>
      </div>
    </section>
  );
}
