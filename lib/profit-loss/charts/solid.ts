/**
 * The annex's `solido` shape — the SAME bars of the flat reading, drawn as solids on the stage.
 *
 * What draws them is `lib/charts/solid-bars.ts`, shared with «Composición por servicio» and
 * «Concentración por pagador»: the shape and its chrome belong to the stage, not to this module.
 * What stays here is what only the annex knows — that its bars are ordered largest first, that each
 * rubro wears the hue the flat card gave it, and that its figures are money with cents because they
 * are checked against the accountant's sheet.
 *
 * **The colour arrives FLAT and is translated by slot.** What comes in is the pastel's own hue for
 * that rubro, and `stageSliceColor` steps it into the register the navy asks for — the same journey
 * the rosca's wedges make, which is what keeps one rubro one colour across the four shapes of the
 * annex. A colour the sequence does not contain is left alone, so nothing here has to know which
 * scale it was handed.
 */
import { CHART_STAGE_NEUTRAL, stageSliceColor } from "@/lib/charts/palette";
import { SOLID_BARS_HEIGHT, solidBarsOption } from "@/lib/charts/solid-bars";
import type { Chart3DOption } from "@/lib/charts/types";
import type { AmountEntry } from "../analytics/structure";
import { formatAxisValue, formatChartValue, type ChartUnit } from "./option";

export const SOLID_HEIGHT = SOLID_BARS_HEIGHT;

export function solidBarOption(
  entries: readonly AmountEntry[],
  context: { colorOf: (code: string) => string; unit?: ChartUnit },
): Chart3DOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit ?? "moneda";
  // A fill PER COLUMN: with a single row that is what `solidBarsOption` reads, and it is the case it
  // documents — the colour is the rubro's identity, not the row's.
  const colors = ranked.map((entry) => stageSliceColor(context.colorOf(entry.code)));

  return solidBarsOption({
    columns: ranked.map((entry) => entry.label),
    // ONE row: the annex has a line and an amount, and nothing else to put on a third axis.
    rows: [
      {
        id: "distribucion",
        name: "Monto",
        // The row's fill is only the fallback for a column the list does not reach; every bar takes
        // its own from `colors`.
        color: colors[0] ?? CHART_STAGE_NEUTRAL,
        values: ranked.map((entry) => entry.value),
      },
    ],
    colors,
    // The ACCOUNT CODE under the name: the axis only fits a truncated label, and the tooltip is
    // where the accountant identifies the row of their own plan.
    subLabels: ranked.map((entry) => (entry.code.length > 0 ? entry.code : undefined)),
    formatValue: (value) => formatChartValue(value, unit),
    formatAxis: (value) => formatAxisValue(value, unit),
  });
}
