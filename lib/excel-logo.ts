/**
 * A WORKBOOK'S LETTERHEAD — a band the WIDTH OF THE TABLE at the start of each sheet: the client's
 * logo stuck to the left edge, the title block CENTRED over the columns, and the center's logo stuck
 * to the right edge.
 *
 * **Who occupies each side is decided by the caller, not by this file.** The three modules lay it out
 * alike —the workspace's opens on the left, that sheet's center closes on the right—, but where each
 * one comes from is not: in PyG and in Ocupaciones the center is a row that comes out of the data,
 * and in Rol de Pagos the client declares it (`letterheadLogos`, in `lib/cost-center.ts`). The
 * parameters are named by their PLACE because that is the only thing this file knows about them.
 *
 * It lives apart and not inside each `export.ts` because the three modules that download Excel want
 * exactly the same thing, and two versions of «where the letterhead goes» would end up putting it in
 * different places.
 *
 * **The gap is reserved by WRITING, not by shifting.** Stamping the logo onto the finished workbook,
 * making room with `spliceRows`, was tried; it was dropped because exceljs loses cell NOTES when
 * moving rows (measured: `spliceRows` and `insertRows` both erase them), and those notes carry the
 * accountant's comments and each adjustment's «Valor original» — that is, exactly what makes the
 * downloaded workbook explain its own figures. That is why `writeLetterhead` is called at the start
 * of each sheet, while it is still empty and there is no note to lose.
 *
 * **The band reaches the end of the TABLE.** It used to end at the label block —the account's code
 * and name—, and that was defensible: the right-hand logo could be seen without scrolling. But a
 * letterhead is the head of the table, and one that stops at 390 px does not read as its corner but
 * as something floating among the figures. The price is accepted and is real: in Ocupaciones (some 35
 * day columns) and in Rol de Pagos (eighty) both the right-hand logo and the centre of the title fall
 * outside the first screenful and have to be scrolled to. In PyG with thirteen months the band
 * measures ~1,640 px, which does fit on a normal monitor. And since it comes from the columns' REAL
 * widths, changing one column's width moves the letterhead with it.
 *
 * **The title block is merged from the module's OWN column, not always from A**, and that is the only
 * thing that holds up the round trip: a merged cell's value lives in its top-left corner, and each
 * reader looks for its own in a particular column —`findCompany` reads B in Rol de Pagos, `readNames`
 * and `readCompanyName` read A—. Merging from the column that reader already looks at, the three
 * files come back in without touching a single parser.
 *
 * **Shifting the preamble is safe, and not by accident.** No reader in this app looks for it on a
 * fixed row: `findFirstDataRow` locates the first row with an account code, `findHeaderRow` walks
 * back from it, `readNames` counts non-empty lines and `findCompany`/`findPeriod` locate their own by
 * shape. A few letterhead rows in front change none of those answers. The image does not get in the
 * way either: the workbook is re-read with SheetJS, which ignores floating images.
 */
import type ExcelJS from "exceljs";
import { fitLogoBox, logoBase64, logoExtension, type EntityLogo } from "@/lib/logos";

/**
 * EACH logo's gap, in pixels. A generous width —it covers the code column and the name column, which
 * together run past 300 px— and a height of some three rows: what a letterhead asks for without
 * pushing the estado de resultados off the first screenful.
 */
const LOGO_SLOT = { width: 240, height: 56 };

/** Minimum breathing room between the two logos when the table is narrower than both of them. */
const LOGO_GAP = 16;

/** Default height of an Excel row, in pixels. It is what turns the logo's height into rows. */
const ROW_HEIGHT = 20;

/**
 * The width of a column nobody declared, in CHARACTERS. It is the 64 px of a freshly created column,
 * which is what a blank Excel sheet measures.
 */
const DEFAULT_COLUMN_WIDTH = 8.43;

/** The band's fill and the rule that closes it — the greys the three downloads already paint their
 *  headers with, so the letterhead does not introduce a dialect of its own. */
const BAND_FILL = "FFF1F5F9";
const BAND_RULE = "FF94A3B8";

/**
 * A column width in pixels. A sheet measures in characters of its default font, and Excel's
 * conversion is 7 px per character plus 5 of padding.
 */
export function columnWidthPx(width: number | undefined): number {
  return Math.round((width ?? DEFAULT_COLUMN_WIDTH) * 7) + 5;
}

/**
 * Cap on the columns walked while looking for an offset. `XFD` is Excel's last one, but long before
 * that an anchor has become absurd: this is only here so an outlandish `px` does not loop forever.
 */
const MAX_ANCHOR_COLUMN = 256;

/** EMU per pixel — the unit in which the xlsx format stores an image's offset. */
const EMU_PER_PIXEL = 9525;

/**
 * An image's anchor: the WHOLE column and how many EMU into it it starts.
 *
 * **exceljs' fractional form (`col: 3.5`) is deliberately not used, and it is not a preference.** Its
 * `Anchor` converts that fraction with `width_in_characters × 10000` EMU per column, when a character
 * measures some 66,700 EMU: every fraction comes out shrunk more than sixfold, so a logo asked for at
 * 80% of a wide column is drawn at 13% of it. It was seen in the file — the center's logo appeared
 * right at the start of the name column instead of at its end. `nativeCol` + `nativeColOff` is the
 * format's own representation and exceljs writes it as it is.
 */
export interface ColumnAnchor {
  nativeCol: number;
  /** Offset within that column, in EMU. */
  nativeColOff: number;
}

/**
 * Where an offset in pixels falls, in the format's vocabulary. `widths` are the declared widths, in
 * sheet order; the columns that do not reach the list are worth what a blank column is worth, which
 * is exactly what happens in the real sheet.
 *
 * It is pure and that is why it can be tested: it is the only arithmetic in this file that can be
 * wrong, and a badly anchored logo is discovered by opening the .xlsx, not by reading the code.
 */
export function columnAnchorAt(widths: readonly (number | undefined)[], px: number): ColumnAnchor {
  let remaining = Math.max(0, px);
  for (let index = 0; index < MAX_ANCHOR_COLUMN; index++) {
    const width = columnWidthPx(widths[index]);
    if (remaining < width) {
      return { nativeCol: index, nativeColOff: Math.round(remaining * EMU_PER_PIXEL) };
    }
    remaining -= width;
  }
  return { nativeCol: MAX_ANCHOR_COLUMN, nativeColOff: 0 };
}

/**
 * Where the letterhead's band ends, in pixels: the TABLE's right edge, unless the two logos do not
 * fit in it, in which case the band widens just enough for them not to overlap.
 *
 * That second half is not over-defensive: a single-mode statement is three columns and a landscape
 * logo can ask for 240, so without it two wide logos would overlap — and a logo on top of another is
 * not a letterhead, it is a smudge.
 *
 * Pure, because it is the arithmetic that decides where the logo ends and that is exactly what cannot
 * be checked by reading the code: it is checked by opening the .xlsx.
 */
export function bandWidthFor(
  widths: readonly (number | undefined)[],
  /** How many columns the TABLE being headed measures. */
  tableColumns: number,
  leftWidth: number,
  rightWidth: number,
): number {
  let table = 0;
  for (let index = 0; index < tableColumns; index++) {
    table += columnWidthPx(widths[index]);
  }
  return Math.max(table, leftWidth + LOGO_GAP + rightWidth);
}

/**
 * The image ids each workbook already has, by data URL. `wb.addImage` does not deduplicate, so
 * without this a twelve-center «Excel completo» would embed twelve copies of the same client PNG. The
 * key is the data URL and not the object, because the same logo can arrive in two different objects
 * —one from the client and one read from its center registry— and still be one single PNG.
 */
const imageIds = new WeakMap<ExcelJS.Workbook, Map<string, number>>();

function imageIdFor(wb: ExcelJS.Workbook, logo: EntityLogo): number {
  let byUrl = imageIds.get(wb);
  if (!byUrl) {
    byUrl = new Map();
    imageIds.set(wb, byUrl);
  }
  const cached = byUrl.get(logo.dataUrl);
  if (cached !== undefined) {
    return cached;
  }
  const id = wb.addImage({ base64: logoBase64(logo), extension: logoExtension(logo) });
  byUrl.set(logo.dataUrl, id);
  return id;
}

/** One line of the title block, in whatever ink it takes. */
export interface LetterheadLine {
  text: string;
  font?: Partial<ExcelJS.Font>;
}

export interface Letterhead {
  /** The one that heads on the left, stuck to the edge. */
  leftLogo?: EntityLogo | null;
  /** The right-hand one. The Consolidado, the raw month and a client with no center have none. */
  rightLogo?: EntityLogo | null;
  /** How many columns the TABLE measures. It is what fixes the band's right edge. */
  columns: number;
  /**
   * From which column (1-based) the title block is merged. Column A except in Rol de Pagos, whose
   * reader looks for the company in B — see this file's header.
   */
  firstColumn?: number;
  /** The title's lines, already composed by the module. */
  lines?: readonly LetterheadLine[];
}

/**
 * Writes the letterhead's band at the start of a FRESHLY CREATED sheet: the title block's rows centred
 * over the table, the fill that makes them look like a header and not loose text in A1, the rule that
 * separates them from what comes below, and the two logos anchored to the edges. With no logos and no
 * lines it does nothing, which is what allows calling it unconditionally.
 *
 * The sheet's COLUMN WIDTHS have to be set already when it is called, because the right-hand logo's
 * anchor comes from them. Setting them writes no row, so bringing them forward changes nothing else.
 */
export function writeLetterhead(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  band: Letterhead,
): void {
  const { columns, firstColumn = 1, lines = [] } = band;
  const left = band.leftLogo ? fitLogoBox(band.leftLogo, LOGO_SLOT) : null;
  const right = band.rightLogo ? fitLogoBox(band.rightLogo, LOGO_SLOT) : null;
  if (!left && !right && lines.length === 0) {
    return;
  }

  // The height is asked for by the taller of the two sides: the title block and the logo. With rows
  // for only one, the other would spill over what comes below.
  const logoHeight = Math.max(left?.height ?? 0, right?.height ?? 0);
  const rows = Math.max(lines.length, Math.ceil(logoHeight / ROW_HEIGHT), 1);
  const lastColumn = Math.max(columns, firstColumn);

  // The rows are painted BEFORE being merged: exceljs propagates the master cell's style to the whole
  // range, so merging at the end is what spreads the fill and the rule without having to write them
  // again cell by cell inside the range.
  const written: ExcelJS.Row[] = [];
  for (let index = 0; index < rows; index++) {
    const row = ws.addRow([]);
    written.push(row);
    for (let column = 1; column <= lastColumn; column++) {
      const cell = row.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      if (index === rows - 1) {
        cell.border = { bottom: { style: "thin", color: { argb: BAND_RULE } } };
      }
    }
  }

  lines.forEach((line, index) => {
    const row = written[index];
    if (!row) {
      return;
    }
    const cell = row.getCell(firstColumn);
    cell.value = line.text;
    if (line.font) {
      cell.font = line.font;
    }
    cell.alignment = { horizontal: "center", vertical: "middle" };
    if (lastColumn > firstColumn) {
      ws.mergeCells(row.number, firstColumn, row.number, lastColumn);
    }
  });

  // Centred against the WHOLE band and not hung from its first row: a logo aligned to the top over a
  // four-line letterhead leaves a gap under it that reads as a composition error. It is the same rule
  // as the payslip PDF's header.
  const bandHeight = rows * ROW_HEIGHT;
  if (band.leftLogo && left) {
    ws.addImage(imageIdFor(wb, band.leftLogo), {
      tl: topLeftAt({ nativeCol: 0, nativeColOff: 0 }, (bandHeight - left.height) / 2),
      ext: left,
      editAs: "oneCell",
    });
  }
  if (band.rightLogo && right) {
    const widths = (ws.columns ?? []).map((column) => column?.width);
    const width = bandWidthFor(widths, columns, left?.width ?? 0, right.width);
    ws.addImage(imageIdFor(wb, band.rightLogo), {
      tl: topLeftAt(
        columnAnchorAt(widths, Math.max(0, width - right.width)),
        (bandHeight - right.height) / 2,
      ),
      ext: right,
      editAs: "oneCell",
    });
  }
}

/**
 * The anchor on the first row, `offsetPx` into it, in the form `addImage` accepts.
 *
 * The cast is to exceljs' TYPES, not to its behaviour: its `Anchor` has always read
 * `nativeCol`/`nativeColOff` —and they are what it writes as they are into `<xdr:col>`/`<xdr:colOff>`—,
 * but its `.d.ts` only declares the `{col, row}` pair, which is precisely the one it converts badly.
 * It is isolated in a function so the cast is written ONCE and with its reason next to it.
 */
function topLeftAt(anchor: ColumnAnchor, offsetPx = 0): { col: number; row: number } {
  return {
    ...anchor,
    nativeRow: 0,
    nativeRowOff: Math.round(Math.max(0, offsetPx) * EMU_PER_PIXEL),
  } as unknown as { col: number; row: number };
}
