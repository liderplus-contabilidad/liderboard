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

/**
 * Default bound for the width of a numeric figure, in monospace characters (`-$1,171,420`).
 *
 * It is a BOUND and not a measurement on purpose — measuring the real text would need a canvas, and
 * this has to stay testable — but the bound has to match what the caller actually prints. PyG's
 * statement writes whole dollars and fits in ten; a table that writes cents on millions
 * (`$1,446,789.21`) needs thirteen, and handing it the default silently CLIPPED the last digits of
 * every large figure: the column was sized for a number narrower than the one in it, and
 * `overflow-hidden` cut the rest off without a mark. That is why the bound is now a parameter: the
 * caller knows how wide its own figures are, and this file cannot.
 */
export const WIDEST_FIGURE_CHARS = 10;

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

/**
 * Determines the first page and font size combination where `columnCount` columns fit.
 *
 * `widestFigureChars` is how many monospace characters the caller's WIDEST cell takes. It defaults
 * to the statement's ten, so every existing caller keeps the layout it had; a caller that prints
 * wider figures passes its own count and gets columns that actually hold them.
 */
export function statementFit(
  columnCount: number,
  widestFigureChars: number = WIDEST_FIGURE_CHARS,
): StatementFit {
  const sheets = [PORTRAIT_WIDTH, LANDSCAPE_WIDTH] as const;

  for (const sheetWidth of sheets) {
    for (const fontSize of FONT_STEPS) {
      const candidate = describe(sheetWidth, fontSize, true, widestFigureChars);
      if (columnCount * candidate.columnWidth <= sheetWidth - MIN_NAME_WIDTH) {
        return candidate;
      }
    }
  }

  return describe(
    LANDSCAPE_WIDTH,
    FONT_STEPS[FONT_STEPS.length - 1] as number,
    false,
    widestFigureChars,
  );
}

function describe(
  sheetWidth: number,
  fontSize: number,
  fits: boolean,
  widestFigureChars: number,
): StatementFit {
  const cellPaddingX = paddingFor(fontSize);
  return {
    orientation: sheetWidth === PORTRAIT_WIDTH ? "portrait" : "landscape",
    sheetWidth,
    fontSize,
    cellPaddingX,
    columnWidth: Math.ceil(fontSize * MONO_ADVANCE * widestFigureChars) + cellPaddingX,
    fits,
  };
}
