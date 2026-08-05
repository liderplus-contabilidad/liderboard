/** Usable width for A4 portrait (210 mm − 28 mm margins) at 96 dpi. */
const PORTRAIT_WIDTH = 688;

/** Usable width for A4 landscape (297 mm − 28 mm margins) at 96 dpi. */
const LANDSCAPE_WIDTH = 1016;

/** Minimum width for the name column to remain readable. */
const MIN_NAME_WIDTH = 190;

/** Font sizes supported, from largest to smallest. */
const FONT_STEPS = [10.5, 9.5, 8.5] as const;

/** Character width for IBM Plex Mono font, in ems. */
const MONO_ADVANCE = 0.6;

/** Maximum width of a numeric figure (`-$1,171,420`). */
const WIDEST_FIGURE_CHARS = 10;

/** Calculates cell padding based on font size. */
function paddingFor(fontSize: number): number {
  return fontSize >= 10 ? 20 : 12;
}

export interface StatementFit {
  /** Page orientation: portrait or landscape. */
  orientation: "portrait" | "landscape";
  /** Usable page width in pixels at 96 dpi. */
  sheetWidth: number;
  /** Table font size in pixels. */
  fontSize: number;
  /** Total horizontal cell padding in pixels. */
  cellPaddingX: number;
  /** Width required for one numeric column in pixels. */
  columnWidth: number;
  /** Whether the columns fit within the page. */
  fits: boolean;
}

/** Determines the first page and font size combination where `columnCount` columns fit. */
export function statementFit(columnCount: number): StatementFit {
  const sheets = [PORTRAIT_WIDTH, LANDSCAPE_WIDTH] as const;

  for (const sheetWidth of sheets) {
    for (const fontSize of FONT_STEPS) {
      const candidate = describe(sheetWidth, fontSize, true);
      if (columnCount * candidate.columnWidth <= sheetWidth - MIN_NAME_WIDTH) {
        return candidate;
      }
    }
  }

  return describe(LANDSCAPE_WIDTH, FONT_STEPS[FONT_STEPS.length - 1] as number, false);
}

function describe(sheetWidth: number, fontSize: number, fits: boolean): StatementFit {
  const cellPaddingX = paddingFor(fontSize);
  return {
    orientation: sheetWidth === PORTRAIT_WIDTH ? "portrait" : "landscape",
    sheetWidth,
    fontSize,
    cellPaddingX,
    columnWidth: Math.ceil(fontSize * MONO_ADVANCE * WIDEST_FIGURE_CHARS) + cellPaddingX,
    fits,
  };
}
