"use client";

import { SpecCard } from "@/components/ui/chart-card";
import type { ChartCardSpec } from "@/lib/charts/types";

/**
 * The report's cards — the SAME `ChartCardSpec[]` the screen renders, only laid out for a page
 * and stripped of what a printed card cannot use.
 *
 * `tableToggle` is off because the toggle is a control, and a control printed on paper is a
 * button nobody can press. The chart is what prints; its table twin exists on screen for the
 * reader who needs the exact figure, and in the report that role belongs to the statement.
 */
export function ReportCards({ cards }: { cards: readonly ChartCardSpec[] }) {
  return (
    <div className="flex flex-col gap-4">
      {cards.map((card) => (
        <div key={card.id} className="print-keep">
          <SpecCard spec={card} tableToggle={false} showGuide={false} />
        </div>
      ))}
    </div>
  );
}
