/**
 * The annex's `solido` shape — the SAME bars of the flat reading, drawn as solids on the stage.
 *
 * What draws them is `lib/charts/solid-bars.ts`, shared with «Composición por servicio» and
 * «Concentración por pagador»: the shape and its chrome belong to the stage, not to this module.
 * What stays here is what only the annex knows — that its bars are ordered largest first, that they
 * all carry the BLOCK's colour, and that its figures are money with cents because they are checked
 * against the accountant's sheet.
 *
 * **One fill, and the LIGHT is what separates them.** The colour is `CHART_STAGE_SECTION.cost`, a
 * blue that means «costos y gastos» in Datos, in the report and here, so eighteen bars share it and
 * nothing but their edges tells them apart — see `CHART_STAGE_LIGHT` for what draws those.
 */
import { CHART_STAGE_SECTION } from "@/lib/charts/palette";
import { SOLID_BARS_HEIGHT, solidBarsOption } from "@/lib/charts/solid-bars";
import type { Chart3DOption } from "@/lib/charts/types";
import type { AmountEntry } from "../analytics/structure";
import { formatAxisValue, formatChartValue, type ChartUnit } from "./option";

export const SOLID_HEIGHT = SOLID_BARS_HEIGHT;

/** The block colour of the expense annex, on the stage. Exported so the card does not name a hex. */
export const SOLID_EXPENSE_COLOR = CHART_STAGE_SECTION.cost;

export function solidBarOption(
  entries: readonly AmountEntry[],
  context: { colorOf: (code: string) => string; unit?: ChartUnit },
): Chart3DOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit ?? "moneda";

  return solidBarsOption({
    columns: ranked.map((entry) => entry.label),
    // ONE row: the annex has a line and an amount, and nothing else to put on a third axis.
    rows: [
      {
        id: "distribucion",
        name: "Monto",
        color: context.colorOf(ranked[0]?.code ?? ""),
        values: ranked.map((entry) => entry.value),
      },
    ],
    // The ACCOUNT CODE under the name: the axis only fits a truncated label, and the tooltip is
    // where the accountant identifies the row of their own plan.
    subLabels: ranked.map((entry) => (entry.code.length > 0 ? entry.code : undefined)),
    formatValue: (value) => formatChartValue(value, unit),
    formatAxis: (value) => formatAxisValue(value, unit),
  });
}
