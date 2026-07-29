"use client";

import { Scissors } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { usePygData } from "./pyg-data-provider";

/**
 * Copies the 5.2 subtree as section 6 (non-operational expenses, set to 0)
 * across all centers under the Income Statement card.
 * Once done, the control disappears unless a notice is needed.
 */
export function SegmentActions() {
  const { dataset, segmented, segmentable, segment } = usePygData();
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<string[] | null>(null);

  const available = Boolean(dataset) && !segmented && segmentable;
  const notice = skipped !== null && skipped.length > 0;
  if (!available && !notice) {
    return null;
  }

  const onSegment = async () => {
    setBusy(true);
    try {
      setSkipped(await segment());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4">
      {notice && (
        <NoticeBanner details={skipped ?? []} onDismiss={() => setSkipped(null)} className="mb-3">
          {skipped?.length === 1 ? "Un estado se quedó" : `${skipped?.length} estados se quedaron`}{" "}
          sin sección no operacional: no traen la cuenta 5.2.
        </NoticeBanner>
      )}

      {available && (
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="secondary"
            icon={<Scissors size={15} />}
            disabled={busy}
            onClick={onSegment}
          >
            {busy ? "Segmentando…" : "Segmentar gastos"}
          </Button>
          <p className="max-w-[560px] text-[12.5px] leading-[1.55] text-ink-soft">
            Copia las cuentas de <span className="font-mono text-ink">5.2</span> como una sección{" "}
            <span className="font-mono text-ink">6</span> de gastos no operacionales, en 0.
          </p>
        </div>
      )}
    </section>
  );
}
