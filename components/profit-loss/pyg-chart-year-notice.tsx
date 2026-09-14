"use client";

import { NoticeBanner } from "@/components/ui/notice-banner";
import { formatList } from "@/lib/format";
import { usePygData } from "./pyg-data-provider";

/**
 * Gráficos and Análisis read ONE year — `chartYear`, the most recent of the years on screen
 * (`selection.ts` declares it «for now») — while Datos and the report lay every visible year side
 * by side. With a single year on screen, the default, the two readings agree and there is nothing
 * to say. With several marked, no card names the year it draws, so this is where the difference is
 * told: which year the charts read, and where the others are compared. It sits in the module's
 * notice slot, the same one Datos uses for the drift notice, and renders NOTHING otherwise.
 */
export function PygChartYearNotice() {
  const { visibleYears, chartYear } = usePygData();

  if (visibleYears.length < 2) {
    return null;
  }
  const others = visibleYears.filter((year) => year !== chartYear).map(String);

  return (
    <div className="shrink-0 border-b border-border bg-surface px-7 py-2.5">
      <NoticeBanner>
        Los gráficos leen un solo año: se dibuja <strong>{chartYear}</strong>. Para comparar{" "}
        {formatList(others)} con {chartYear} usa Datos, o marca un solo año en «Año».
      </NoticeBanner>
    </div>
  );
}
