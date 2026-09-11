/**
 * The HTML a tooltip's FORMATTER writes, shared by every module that opens a box over ONE series.
 *
 * ECharts hands a formatter the marker of the hovered datum and nothing else, so a box that lists
 * a series' whole run — the year's months under the line the pointer is on — builds its own rows.
 * The construction lives here and not in each module's chrome because the layout is the reading's,
 * not the module's: Reportería's comparativo and Costo de personal's «vs ventas» are the same box
 * with a different unit, and two copies would drift in the gutter or in the bold.
 */

/** The colour dot a row carries — ECharts' own `marker`, rebuilt for the rows the renderer did not
 *  hand over. */
export function tooltipMarker(color: string): string {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:10px;background:${color};margin-right:4px"></span>`;
}

export interface TooltipRow {
  label: string;
  figure: string;
}

/**
 * A series' run as a box: `head` on top, `rows` under it in TWO columns read DOWN (the first half,
 * then the second), the row named by `current` in bold.
 *
 * Two columns and not one because twelve rows make a box taller than the plot, and `confine` then
 * pins it to the card's edge far from the line being followed. Reading down keeps the workbook's
 * order — a column is half a year, not the odd and the even months. The gutter between the two runs
 * is wider than the gap between a label and its figure, so the eye reads two columns and not four.
 * With no rows the box says so in `mutedTone`, the axis tooltip's same «Sin cargar».
 */
export function seriesRunTooltip(
  head: string,
  rows: readonly TooltipRow[],
  current: string | undefined,
  mutedTone: string,
): string {
  const cell = (row: TooltipRow, lead = "") => {
    const weight = row.label === current ? "font-weight:700" : "";
    return `<span style="${lead}${weight}">${row.label}</span><span style="text-align:right;${weight}">${row.figure}</span>`;
  };
  const half = Math.ceil(rows.length / 2);
  const body = Array.from({ length: half }, (_, index) => {
    const right = rows[index + half];
    return `${cell(rows[index])}${
      right === undefined ? "<span></span><span></span>" : cell(right, "padding-left:14px;")
    }`;
  }).join("");
  return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${
    body
      ? `<div style="display:grid;grid-template-columns:auto auto auto auto;column-gap:6px;row-gap:2px">${body}</div>`
      : `<div style="color:${mutedTone}">Sin cargar</div>`
  }`;
}
