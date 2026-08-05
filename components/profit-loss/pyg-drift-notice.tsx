"use client";

import { useMemo } from "react";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { computeResultDrift, describeResultDrift } from "@/lib/profit-loss/result-drift";
import { usePygData } from "./pyg-data-provider";

/**
 * Displays a notice when adjustments cause a discrepancy in the Utilidad compared to the uploaded file.
 * Positioned outside the scrolling panel to ensure visibility, as discrepancies often occur off-screen.
 * Remains visible until figures align, which is the default state.
 */
export function PygDriftNotice() {
  const { activeSlices } = usePygData();

  const drift = useMemo(() => computeResultDrift(activeSlices), [activeSlices]);
  const copy = useMemo(() => (drift ? describeResultDrift(drift) : null), [drift]);

  if (!copy) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-border bg-surface px-7 py-2.5">
      <NoticeBanner details={copy.details}>{copy.summary}</NoticeBanner>
    </div>
  );
}
