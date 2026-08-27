/**
 * WHERE EACH TEXT OF THE PAYSLIP FALLS — pure, and therefore testable.
 *
 * It receives a `PayslipDocument` and returns fills, rules and placed boxes. `render.ts` draws them
 * without deciding anything, which is what allows asserting here —without generating a PDF— that no
 * box falls off the page and that the longest amount fits in its column.
 *
 * **The proportions are the Excel's; the size is not.** The original block measures 355 px (`B`–`G`
 * at 96 dpi = 266 pt): the `H` and `I` columns the `Print_Area` includes are the CHANNEL between the
 * two copies the accountant prints side by side, and they carry nothing. 266 pt on a 595 A4 is less
 * than half the page, and at that scale the longest label —`PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS`,
 * 24.5 em of Helvetica— would ask for a 6 pt size. So the ratio between the three columns
 * (163 : 84 : 108) is kept, stretched to the usable width, and the TYPOGRAPHY is not scaled with it:
 * scaling it 1.82× would give 18 pt and a payslip that looks like a poster.
 *
 * **The label extends as far as the Excel lets it extend.** On the sheet, a long label overflows into
 * the empty cells to its right — that is why the 39 characters of `PRESTAMOS QUIROGRAFARIOS E
 * HIPOTECARIOS` fit in a 122 pt column. Only five rows have anything in `Cantidad` (the three
 * overtime ones and the two marked `(*)`) and all five have a short label. Here that is written as a
 * RULE instead of being inherited from the accident of which cells happened to be empty: a row with
 * `Cantidad` fits its label up to the start of that column, one without it reaches the start of
 * `Valores`.
 *
 * **The hierarchy is the DOCUMENT's, not the Excel's**, and it is the point where this payslip
 * deliberately departs from the book. The sheet is a grid of cells and nothing more; here there are
 * five blocks with different weight —header, identity, the two sections and the net pay— so it can be
 * read at a glance. The colours are not invented: they come from `palette.ts`, and the two that lead
 * are the fills the accountant themselves uses for income and costs on their sheet.
 */
import { fitLogoBox } from "@/lib/logos";
import { PAYSLIP_DECLARATION, PAYSLIP_SIGNATURE_CAPTION } from "./document";
import { PAYSLIP_COLORS } from "./palette";
import type {
  MeasureText,
  PayslipBox,
  PayslipDocument,
  PayslipFill,
  PayslipImage,
  PayslipPage,
  PayslipRow,
  PayslipRule,
} from "./types";

/** A4 vertical en puntos. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 36;

/** The Excel's three columns in px (`B`–`D`, `E`–`F`, `G`), which is the only thing that is kept. */
const COLUMN_RATIO = { label: 163, quantity: 84, value: 108 } as const;

const BODY_SIZE = 9;
/** The steps a text that does not fit drops to, before being truncated. */
const SIZE_STEPS = [9, 8, 7] as const;
/**
 * The steps for the company's label. It is the ONLY hierarchy block allowed to shrink, and the reason
 * is that ever since the cost center exists its text has TWO halves («Delicmar · Planta Ambato»):
 * truncating it takes the second one away, which is exactly what the center exists to say, whereas
 * dropping a size keeps it whole. The last step, 11, sits below the right-hand title (13) and that is
 * deliberate: it is only reached by a label of more than forty characters —a client's long name PLUS
 * its center's—, and there losing the half that says which center the paper belongs to is worse than
 * losing the step. It stays above the letterhead (8) and the month (9), which are the ones it cannot
 * match.
 */
const COMPANY_SIZE_STEPS = [15, 13.5, 12, 11] as const;
/**
 * The height the company's line RESERVES, which is the first step and not the one that ends up being
 * used. A long label is drawn smaller but does not lift what is below it: otherwise, adding the cost
 * center's name would move the letterhead, the title and even the logo, and two payslips of the same
 * client would stop overlapping.
 */
const COMPANY_SIZE = COMPANY_SIZE_STEPS[0];
const TITLE_SIZE = 13;
const SUBTITLE_SIZE = 9;
const SECTION_SIZE = 8.5;
const TOTAL_SIZE = 9.5;
const NET_SIZE = 11.5;
const FOOTNOTE_SIZE = 7.5;

const ROW_PITCH = 12.6;
const SECTION_BAND_HEIGHT = 15;
const NET_BAND_HEIGHT = 24;
/** Breathing room inside a band or panel, left and right. */
const PAD_X = 7;

const ELLIPSIS = "…";

/**
 * EACH logo's gap — the client's on the left and the cost center's on the right. It is the SAME for
 * both because they are a pair: the same layout that heads the Excel files and PyG's report. Constant,
 * and not derived from the header's height, because the centred block already depends on it:
 * subtracting its width is what fixes how much room is left for the text, and doing it the other way
 * round would be a circular definition.
 *
 * **The width is MEASURED, not chosen.** Centring the block charges each letterhead line both logo
 * gaps, and the one that decides is the location: the real client's measures 324.7 pt at 8 pt, and a
 * longer one drops to 6.5 pt, where it measures 357.7. With the 76 pt the gap had when the title
 * lived on the right, the block was left with 327 pt — the real one just about fitted and the long one
 * was truncated, which is exactly what the firm said cannot happen. At 58 there are 363 left, so both
 * go in whole and with room to spare. The HEIGHT (44) stays below the shortest header there is
 * —company, title and month with no letterhead, 49 pt—, so a logo never falls outside the band it is
 * centred against.
 */
const LOGO_SLOT = { width: 58, height: 44 } as const;

/** Breathing room between a logo and the header's centred block. */
const LOGO_GAP = 10;

/** Breathing room between the letterhead and the document's title, which opens the header's second
 *  step. */
const TITLE_GAP = 8;

/** Breathing room between the title and the month below it. */
const TITLE_PERIOD_GAP = 4;

/** The size of the letterhead's lines and the steps they drop to before being truncated. They start
 *  below the name —they are its identity footer, not another title— and reach 6.5 because the
 *  location line runs past seventy characters in a real file. */
const HEADER_LINE_STEPS = [8, 7, 6.5] as const;

/** From one letterhead line to the next. */
const HEADER_LINE_PITCH = 9.6;

/** Breathing room between the company's name and the letterhead's first line. */
const HEADER_LINE_GAP = 3;

const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
const ratioTotal = COLUMN_RATIO.label + COLUMN_RATIO.quantity + COLUMN_RATIO.value;
const scale = contentWidth / ratioTotal;

/** The three columns' vertical edges. The bands indent their text by `PAD_X`, so the columns live
 *  inside that margin and no label touches the edge of its fill. */
const X_LEFT = MARGIN_X + PAD_X;
const X_QUANTITY_START = MARGIN_X + COLUMN_RATIO.label * scale;
const X_QUANTITY_END = MARGIN_X + (COLUMN_RATIO.label + COLUMN_RATIO.quantity) * scale;
const X_RIGHT = MARGIN_X + contentWidth - PAD_X;

/** Trims a text to the given width, dropping a size before truncating. */
function fit(
  text: string,
  maxWidth: number,
  bold: boolean,
  measure: MeasureText,
  /** The sizes that are tried, largest to smallest. The letterhead passes its own, which start lower
   *  than the table body's. */
  steps: readonly number[] = SIZE_STEPS,
): { text: string; size: number } {
  for (const size of steps) {
    if (measure(text, size, bold) <= maxWidth) {
      return { text, size };
    }
  }

  // Already at the smallest size: it is trimmed character by character leaving room for the ellipsis.
  const size = steps[steps.length - 1];
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}${ELLIPSIS}`, size, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}${ELLIPSIS}`, size };
}

/**
 * Trims a text to a width WITHOUT dropping a size — for the blocks whose size is hierarchy (the
 * company's name, the employee's): shrinking them would break the step that tells them apart.
 */
function clip(text: string, maxWidth: number, size: number, bold: boolean, measure: MeasureText) {
  if (measure(text, size, bold) <= maxWidth) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}${ELLIPSIS}`, size, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}${ELLIPSIS}`;
}

/** Splits a text into the lines that fit in `maxWidth`, by words. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  measure: MeasureText,
): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, bold) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Places a payslip on a portrait A4 page.
 *
 * It also returns `overflow`, which is `true` if the content did not fit in the usable height. It
 * declares it instead of silently clipping: a payslip cut off at the bottom loses the signature line,
 * which is precisely what the paper exists for.
 */
export function layoutPayslip(
  document: PayslipDocument,
  measure: MeasureText,
): PayslipPage & { overflow: boolean } {
  const fills: PayslipFill[] = [];
  const rules: PayslipRule[] = [];
  const images: PayslipImage[] = [];
  const boxes: PayslipBox[] = [];
  let y = MARGIN_TOP;

  const push = (
    text: string,
    x: number,
    size: number,
    bold: boolean,
    color: string,
    align: PayslipBox["align"] = "left",
    atY: number = y,
  ) => {
    boxes.push({ text, x, y: atY, size, bold, align, color });
  };

  const band = (height: number, color: string) => {
    fills.push({ x: MARGIN_X, y, width: contentWidth, height, color });
  };

  // ── Header ──────────────────────────────────────────────────────────────────────────────────
  // The firm's letterhead, with the same layout that heads their Excel files and PyG's report: the
  // client's logo stuck to the left margin, the identity block CENTRED —the company, its letterhead
  // lines, which document it is and for which month— and the cost center's logo stuck to the right
  // margin. The month goes on its own line under the title because it is what tells one payslip from
  // another in a folder with twelve.
  //
  // It lived in two columns —the company on the left, the title on the right— and the price of that
  // was that each block had to MEASURE the other so as not to invade it: the name gave up the
  // title's width, the letterhead's first line gave up a different one from the rest, and a label
  // with a cost center was truncated while there was free room beside it. Centred there are no two
  // blocks disputing a line, so every line gives up THE SAME and there is a single cap.
  //
  // **Both sides reserve the same even when there is only one logo**, and that is what really
  // centres it: subtracting only the side that exists, the block would be centred in what is left
  // over and not on the page, and a payslip with a logo and one without would stop aligning with each
  // other. The boxes come from the dimensions each logo carries stored, without decoding the image —
  // which is what keeps this file pure.
  const leftLogoBox = document.logo ? fitLogoBox(document.logo, LOGO_SLOT) : null;
  const rightLogoBox = document.rightLogo ? fitLogoBox(document.rightLogo, LOGO_SLOT) : null;
  const logoSide = Math.max(leftLogoBox?.width ?? 0, rightLogoBox?.width ?? 0);
  /** What is left for the centred block: the page minus the two logo gaps. */
  const centerLimit = contentWidth - 2 * (logoSide > 0 ? logoSide + LOGO_GAP : 0);
  const centerX = MARGIN_X + contentWidth / 2;

  /** The month as printed, without its prefix: it is measured and drawn, so it is resolved once. */
  const periodText = document.period.replace(/^MES:\s*/, "");

  // The company's label is the ONLY hierarchy block allowed to shrink — see `COMPANY_SIZE_STEPS`,
  // and the reason is its second half, the one that says which center the paper belongs to.
  const companyText = fit(document.company, centerLimit, true, measure, COMPANY_SIZE_STEPS);
  let headerY = y;
  push(companyText.text, centerX, companyText.size, true, PAYSLIP_COLORS.ink, "center", headerY);
  headerY += COMPANY_SIZE;

  // The letterhead, under the name and in soft ink: the razón social with its RUC, the location, the
  // phone numbers and the email. They arrive already composed (`letterheadLines`), so here they are
  // only placed.
  if (document.companyLines.length > 0) {
    headerY += HEADER_LINE_GAP;
    for (const line of document.companyLines) {
      const shaped = fit(line, centerLimit, false, measure, HEADER_LINE_STEPS);
      push(shaped.text, centerX, shaped.size, false, PAYSLIP_COLORS.muted, "center", headerY);
      headerY += HEADER_LINE_PITCH;
    }
  }

  headerY += TITLE_GAP;
  push(document.title, centerX, TITLE_SIZE, true, PAYSLIP_COLORS.ink, "center", headerY);
  headerY += TITLE_SIZE + TITLE_PERIOD_GAP;
  push(periodText, centerX, SUBTITLE_SIZE, false, PAYSLIP_COLORS.muted, "center", headerY);

  /** What the header takes up, counted over what was PLACED and not estimated separately: two
   *  computations of the same height would end up drifting the first time a line moves. */
  const headerHeight = headerY + SUBTITLE_SIZE - y;

  // The two logos, centred against the header's WHOLE block and not hung from its first line: aligned
  // to the top over a four-line letterhead they leave a gap below that reads as a composition error.
  // It is the same rule as the Excel files' band.
  if (document.logo && leftLogoBox) {
    images.push({
      dataUrl: document.logo.dataUrl,
      mime: document.logo.mime,
      x: MARGIN_X,
      y: y + (headerHeight - leftLogoBox.height) / 2,
      width: leftLogoBox.width,
      height: leftLogoBox.height,
    });
  }
  if (document.rightLogo && rightLogoBox) {
    images.push({
      dataUrl: document.rightLogo.dataUrl,
      mime: document.rightLogo.mime,
      x: MARGIN_X + contentWidth - rightLogoBox.width,
      y: y + (headerHeight - rightLogoBox.height) / 2,
      width: rightLogoBox.width,
      height: rightLogoBox.height,
    });
  }

  y += headerHeight + 10;
  rules.push({
    x1: MARGIN_X,
    x2: MARGIN_X + contentWidth,
    y,
    thickness: 1.2,
    color: PAYSLIP_COLORS.ink,
  });
  y += 15;

  // ── Identity ────────────────────────────────────────────────────────────────────────────────
  // A panel instead of three loose lines: it is the answer to «whose paper is this?», and grouping it
  // lets the sections below start without competing with it.
  const panelTop = y;
  const panelHeight = 48;
  fills.push({
    x: MARGIN_X,
    y: panelTop,
    width: contentWidth,
    height: panelHeight,
    color: PAYSLIP_COLORS.panel,
  });

  const identityWidth = contentWidth * 0.58;
  let iy = panelTop + 11;
  push(
    clip(document.employeeName, identityWidth, 10.5, true, measure),
    X_LEFT,
    10.5,
    true,
    PAYSLIP_COLORS.ink,
    "left",
    iy,
  );
  push(document.codeLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.muted, "right", iy);

  iy += 14;
  push(
    clip(document.role, identityWidth, BODY_SIZE, false, measure),
    X_LEFT,
    BODY_SIZE,
    false,
    PAYSLIP_COLORS.muted,
    "left",
    iy,
  );
  push(document.daysLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.muted, "right", iy);

  iy += 12;
  push(document.reserveFundLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.faint, "right", iy);

  y = panelTop + panelHeight + 15;

  // ── Secciones ───────────────────────────────────────────────────────────────────────────────
  const sectionHeader = (title: string, quantity: string | null, color: string) => {
    band(SECTION_BAND_HEIGHT, color);
    const textY = y + 4;
    push(title, X_LEFT, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "left", textY);
    if (quantity) {
      push(quantity, X_QUANTITY_END, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "right", textY);
    }
    push("Valores", X_RIGHT, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "right", textY);
    y += SECTION_BAND_HEIGHT + 5;
  };

  const conceptRow = (row: PayslipRow, index: number) => {
    // The alternating stripe: a row that crosses the page from end to end skips a line without it. It
    // goes so light that it disappears in a photocopy, which is exactly what is wanted — it helps
    // follow the line, it does not inform of anything.
    if (index % 2 === 1) {
      fills.push({
        x: MARGIN_X,
        y: y - 3.5,
        width: contentWidth,
        height: ROW_PITCH,
        color: PAYSLIP_COLORS.zebra,
      });
    }

    // Here lives the overflow rule: with `Cantidad` the label stops at that column, without it it
    // reaches `Valores`. It is what the Excel does on its own when overflowing into empty cells,
    // written as a decision.
    const limit = row.quantity === null ? X_QUANTITY_END : X_QUANTITY_START;
    const label = fit(row.label, limit - X_LEFT - 8, false, measure);
    push(label.text, X_LEFT, label.size, false, PAYSLIP_COLORS.inkSoft);

    if (row.quantity !== null) {
      push(row.quantity, X_QUANTITY_END, BODY_SIZE, false, PAYSLIP_COLORS.muted, "right");
    }

    // Every amount goes at full weight. The faint ink existed so twenty-two dashes would not compete
    // with the four figures that said something; now the dashes are not printed, so whatever is left
    // in the column is a figure and they all weigh the same.
    push(row.value, X_RIGHT, BODY_SIZE, false, PAYSLIP_COLORS.ink, "right");
    y += ROW_PITCH;
  };

  const totalRow = (label: string, value: string) => {
    y += 2;
    rules.push({
      x1: MARGIN_X,
      x2: MARGIN_X + contentWidth,
      y,
      thickness: 0.7,
      color: PAYSLIP_COLORS.border,
    });
    y += 7;
    push(label, X_LEFT, TOTAL_SIZE, true, PAYSLIP_COLORS.ink);
    push(value, X_RIGHT, TOTAL_SIZE, true, PAYSLIP_COLORS.ink, "right");
    y += TOTAL_SIZE + 6;
  };

  // The `Cantidad` header is only written if some printed row uses it: labelling an empty column is
  // promising a datum that is not on the sheet.
  const quantityHeader = document.incomes.some((row) => row.quantity !== null) ? "Cantidad" : null;
  sectionHeader("INGRESOS", quantityHeader, PAYSLIP_COLORS.income);
  document.incomes.forEach(conceptRow);
  totalRow("TOTAL DE INGRESOS", document.totalIncome);
  y += 9;

  sectionHeader("EGRESOS", null, PAYSLIP_COLORS.cost);
  document.deductions.forEach(conceptRow);
  totalRow("TOTAL DE EGRESOS", document.totalDeductions);
  y += 7;

  // ── Net pay ─────────────────────────────────────────────────────────────────────────────────
  // The figure everyone looks for, and the only one on a dark fill: it is the amount the employee
  // declares having received on signing, and it cannot be confused with the other two totals.
  band(NET_BAND_HEIGHT, PAYSLIP_COLORS.net);
  const netY = y + (NET_BAND_HEIGHT - NET_SIZE) / 2 + 1;
  push("LIQUIDO A RECIBIR", X_LEFT, NET_SIZE, true, PAYSLIP_COLORS.white, "left", netY);
  push(document.netPay, X_RIGHT, NET_SIZE, true, PAYSLIP_COLORS.white, "right", netY);
  y += NET_BAND_HEIGHT + 17;

  // ── Footer ──────────────────────────────────────────────────────────────────────────────────
  // The declaration is ~168 characters that on the sheet go into a merged 355 px cell where they do
  // not fit: here it is split into lines, which is an IMPROVEMENT on the original.
  if (document.footnote) {
    push(document.footnote, MARGIN_X, FOOTNOTE_SIZE, false, PAYSLIP_COLORS.faint);
    y += 13;
  }

  for (const line of wrapText(PAYSLIP_DECLARATION, contentWidth, FOOTNOTE_SIZE, false, measure)) {
    push(line, MARGIN_X, FOOTNOTE_SIZE, false, PAYSLIP_COLORS.muted);
    y += FOOTNOTE_SIZE + 2.5;
  }

  // The signature line is DRAWN. The book writes it with underscores because a cell cannot draw
  // anything; here it can, and a real line does not depend on how many `_` fit.
  y += 42;
  rules.push({ x1: MARGIN_X, x2: MARGIN_X + 190, y, thickness: 0.7, color: PAYSLIP_COLORS.ink });
  y += 11;
  push(PAYSLIP_SIGNATURE_CAPTION, MARGIN_X, 8.5, true, PAYSLIP_COLORS.ink);
  y += 11;
  push(document.idCardLine, MARGIN_X, 8.5, false, PAYSLIP_COLORS.muted);
  y += 8.5;

  return { fills, rules, images, boxes, overflow: y > PAGE_HEIGHT - MARGIN_BOTTOM };
}

/** The columns' edges, so the test can assert on them without re-deriving them. */
export const PAYSLIP_COLUMNS = {
  left: X_LEFT,
  quantityStart: X_QUANTITY_START,
  quantityEnd: X_QUANTITY_END,
  right: X_RIGHT,
  /** The edges of the USABLE page — the bands reach here, the text stays inside. */
  pageLeft: MARGIN_X,
  pageRight: MARGIN_X + contentWidth,
} as const;
