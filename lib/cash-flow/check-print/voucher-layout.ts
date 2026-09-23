/**
 * WHERE EACH TEXT OF THE COMPROBANTE FALLS — pure, a vertical A4 in the shape of Dingoo's «COMPROBANTE
 * DE PAGO»: letterhead, the boxed identity, the entry, the documents paid, the payment detail and
 * three signatures. It returns PAGES and not a page because the documents table has no bound: a check
 * that pays forty invoices flows onto a second sheet, repeating the table's header, rather than
 * running off the paper.
 *
 * The table headers are filled with `--color-brand`, the mirror of the navy the accounting system
 * prints: a colour of the firm's paper, not a decoration of the app.
 */
import { fitLogoBox } from "@/lib/logos";
import type { MeasureText, PrintAlign, PrintPage, PrintRect, PrintRule, PrintText } from "./types";
import type { VoucherDocument } from "./voucher";

/** A4 vertical, points. */
export const VOUCHER_PAGE_WIDTH = 595.28;
export const VOUCHER_PAGE_HEIGHT = 841.89;

const MARGIN_X = 28;
const MARGIN_TOP = 26;
/** Room kept for the footer («Generado el…» · «Página n de N»). */
const MARGIN_BOTTOM = 44;
const LEFT = MARGIN_X;
const RIGHT = VOUCHER_PAGE_WIDTH - MARGIN_X;
const WIDTH = RIGHT - LEFT;
const PAD = 4;

const COLORS = {
  /** `--color-ink` */
  ink: "#1e293b",
  /** `--color-brand` — the tables' header band. */
  band: "#1e3a5f",
  /** `--color-border` */
  border: "#cbd5e1",
  white: "#ffffff",
} as const;

const BODY = 8.5;
const COMPANY = 11;
const TITLE = 10;
const ROW = 15;
const LINE = 10.5;
const LOGO_SLOT = { width: 112, height: 50 } as const;

const ELLIPSIS = "…";

function clip(text: string, width: number, size: number, bold: boolean, measure: MeasureText) {
  if (measure(text, size, bold) <= width) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}${ELLIPSIS}`, size, bold) > width) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}${ELLIPSIS}`;
}

function wrap(text: string, width: number, size: number, bold: boolean, measure: MeasureText) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, bold) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

interface Column {
  label: string;
  /** The left edge for a left column, the right edge for a right one. */
  x: number;
  align: PrintAlign;
  /** The room a cell's text has before it is clipped. */
  width: number;
}

/** The documents table's five columns. */
const DOCUMENT_COLUMNS: readonly Column[] = [
  { label: "Fecha emisión", x: LEFT + PAD, align: "left", width: 84 },
  { label: "No. Comprobante", x: LEFT + 92, align: "left", width: 190 },
  { label: "Saldo anterior", x: LEFT + WIDTH * 0.68, align: "right", width: 80 },
  { label: "Abono", x: LEFT + WIDTH * 0.84, align: "right", width: 80 },
  { label: "Saldo actual", x: RIGHT - PAD, align: "right", width: 80 },
];

const PAYMENT_COLUMNS: readonly Column[] = [
  { label: "Forma de pago", x: LEFT + PAD, align: "left", width: 90 },
  { label: "Fecha", x: LEFT + 100, align: "left", width: 70 },
  { label: "Banco/Cuenta", x: LEFT + 180, align: "left", width: 200 },
  { label: "No. Documento", x: LEFT + WIDTH * 0.84, align: "right", width: 80 },
  { label: "Valor", x: RIGHT - PAD, align: "right", width: 80 },
];

const ENTRY_COLUMNS: readonly Column[] = [
  { label: "Código de Cta.", x: LEFT + PAD, align: "left", width: 110 },
  { label: "Nombre de la cuenta", x: LEFT + 120, align: "left", width: WIDTH * 0.8 - 200 },
  { label: "Debe", x: LEFT + WIDTH * 0.84, align: "right", width: 80 },
  { label: "Haber", x: RIGHT - PAD, align: "right", width: 80 },
];

interface Sheet {
  rects: PrintRect[];
  rules: PrintRule[];
  texts: PrintText[];
  images: PrintPage["images"][number][];
}

export function layoutVoucher(document: VoucherDocument, measure: MeasureText): PrintPage[] {
  const sheets: Sheet[] = [];
  let sheet!: Sheet;
  let y = 0;

  const newSheet = () => {
    sheet = { rects: [], rules: [], texts: [], images: [] };
    sheets.push(sheet);
    y = MARGIN_TOP;
  };
  /** Starts a new sheet when `height` does not fit on this one. */
  const ensure = (height: number) => {
    if (y + height > VOUCHER_PAGE_HEIGHT - MARGIN_BOTTOM) {
      newSheet();
    }
  };
  const text = (
    value: string,
    x: number,
    baseline: number,
    options: { size?: number; bold?: boolean; align?: PrintAlign; color?: string } = {},
  ) => {
    if (!value) {
      return;
    }
    sheet.texts.push({
      text: value,
      x,
      y: baseline,
      size: options.size ?? BODY,
      bold: options.bold ?? false,
      align: options.align ?? "left",
      color: options.color ?? COLORS.ink,
    });
  };
  const cell = (column: Column, value: string, baseline: number, bold = false, color?: string) =>
    text(clip(value, column.width, BODY, bold, measure), column.x, baseline, {
      bold,
      align: column.align,
      ...(color ? { color } : {}),
    });
  const band = (columns: readonly Column[]) => {
    sheet.rects.push({ x: LEFT, y, width: WIDTH, height: ROW, fill: COLORS.band });
    for (const column of columns) {
      cell(column, column.label, y + ROW - 4.5, true, COLORS.white);
    }
    y += ROW;
  };

  newSheet();

  // --- Letterhead: logo on the left, the name and its lines beside it.
  const logoBox = document.logo ? fitLogoBox(document.logo, LOGO_SLOT) : null;
  if (document.logo && logoBox) {
    sheet.images.push({ logo: document.logo, x: LEFT, y, ...logoBox });
  }
  const textX = logoBox ? LEFT + LOGO_SLOT.width + 16 : LEFT;
  let headerY = y + COMPANY;
  text(clip(document.company, RIGHT - textX, COMPANY, true, measure), textX, headerY, {
    size: COMPANY,
    bold: true,
  });
  for (const line of document.companyLines) {
    for (const piece of wrap(line, RIGHT - textX, BODY, false, measure)) {
      headerY += LINE;
      text(piece, textX, headerY);
    }
  }
  y = Math.max(y + (logoBox?.height ?? 0), headerY + 4) + 22;

  // --- The boxed identity: title, beneficiary on the left, the date on the right.
  const labelX = LEFT + 14;
  const valueX = LEFT + 92;
  const dateLabelX = LEFT + WIDTH * 0.64;
  const valueWidth = dateLabelX - valueX - 12;
  // An empty field is not printed: the window keeps all three so they can be completed there.
  const party = document.party.filter((field) => field.value.trim().length > 0);
  const partyLines = party.map((field) => wrap(field.value, valueWidth, BODY, false, measure));
  const boxHeight =
    26 + partyLines.reduce((total, lines) => total + lines.length * LINE + 2, 0) + 6;
  const boxTop = y;
  sheet.rects.push({ x: LEFT, y: boxTop, width: WIDTH, height: boxHeight, stroke: COLORS.ink });
  text(document.title, LEFT + 8, boxTop + 15, { size: TITLE, bold: true });
  let rowY = boxTop + 15 + 14;
  party.forEach((field, index) => {
    text(field.label, labelX, rowY, { bold: true });
    for (const [lineIndex, line] of (partyLines[index] ?? []).entries()) {
      text(line, valueX, rowY + lineIndex * LINE);
    }
    rowY += (partyLines[index]?.length ?? 1) * LINE + 2;
  });
  text("Fecha de Emisión:", dateLabelX, boxTop + 15 + 14, { bold: true });
  text(document.issuedOn, dateLabelX + 80, boxTop + 15 + 14);
  y = boxTop + boxHeight + 12;

  // --- The entry: a boxed header, its lines, and the totals under a rule.
  ensure(ROW * (document.entry.length + 2));
  sheet.rects.push({ x: LEFT, y, width: WIDTH, height: ROW, stroke: COLORS.ink });
  for (const column of ENTRY_COLUMNS) {
    cell(column, column.label, y + ROW - 4.5, true);
  }
  y += ROW;
  for (const line of document.entry) {
    const baseline = y + ROW - 4.5;
    const [code, name, debit, credit] = ENTRY_COLUMNS as [Column, Column, Column, Column];
    cell(code, line.code, baseline);
    cell(name, line.name, baseline);
    cell(debit, line.debit, baseline);
    cell(credit, line.credit, baseline);
    y += ROW;
  }
  sheet.rules.push({ x1: LEFT, x2: RIGHT, y: y + 2, thickness: 0.8, color: COLORS.ink });
  cell(ENTRY_COLUMNS[2] as Column, document.entryTotal, y + ROW - 2, true);
  cell(ENTRY_COLUMNS[3] as Column, document.entryTotal, y + ROW - 2, true);
  y += ROW + 16;

  // --- The documents paid, when there are any; the header repeats on every sheet it spans.
  if (document.documents.length > 0) {
    ensure(ROW * 3);
    band(DOCUMENT_COLUMNS);
    for (const line of document.documents) {
      if (y + ROW > VOUCHER_PAGE_HEIGHT - MARGIN_BOTTOM) {
        newSheet();
        band(DOCUMENT_COLUMNS);
      }
      const baseline = y + ROW - 4.5;
      const values = [line.issuedOn, line.number, line.previous, line.amount, line.current];
      DOCUMENT_COLUMNS.forEach((column, index) => cell(column, values[index] ?? "", baseline));
      y += ROW;
      sheet.rules.push({ x1: LEFT, x2: RIGHT, y, thickness: 0.4, color: COLORS.border });
    }
    ensure(ROW);
    const totals = document.documentTotals;
    const baseline = y + ROW - 4.5;
    text("Total", (DOCUMENT_COLUMNS[2] as Column).x - 72, baseline, { bold: true, align: "right" });
    cell(DOCUMENT_COLUMNS[2] as Column, totals.previous, baseline, true);
    cell(DOCUMENT_COLUMNS[3] as Column, totals.amount, baseline, true);
    cell(DOCUMENT_COLUMNS[4] as Column, totals.current, baseline, true);
    y += ROW + 10;
  }

  // --- Payment detail.
  ensure(ROW * 3 + 6);
  text("Detalle de pago", LEFT, y + 9, { bold: true });
  y += 16;
  band(PAYMENT_COLUMNS);
  const payment = document.payment;
  const paymentValues = [
    payment.method,
    payment.date,
    payment.account,
    payment.number,
    payment.value,
  ];
  PAYMENT_COLUMNS.forEach((column, index) =>
    cell(column, paymentValues[index] ?? "", y + ROW - 4.5),
  );
  sheet.rects.push({ x: LEFT, y, width: WIDTH, height: ROW, stroke: COLORS.ink });
  y += ROW;

  // --- Signatures: two lines, and the «visto bueno» centred beneath them.
  ensure(130);
  const signatureWidth = 190;
  const signature = (x1: number, baseline: number, caption: string) => {
    sheet.rules.push({
      x1,
      x2: x1 + signatureWidth,
      y: baseline,
      thickness: 0.8,
      color: COLORS.ink,
    });
    text(caption, x1 + signatureWidth / 2, baseline + 11, { align: "center" });
  };
  y += 58;
  signature(LEFT, y, "Preparado por");
  signature(RIGHT - signatureWidth, y, "Recibí Conforme");
  y += 40;
  signature(LEFT + (WIDTH - signatureWidth) / 2, y, "Visto bueno");

  // --- Footer on every sheet, now that the count is known.
  return sheets.map((current, index) => {
    const footer = VOUCHER_PAGE_HEIGHT - 20;
    current.texts.push(
      {
        text: document.generated,
        x: VOUCHER_PAGE_WIDTH / 2,
        y: footer,
        size: BODY,
        bold: false,
        align: "center",
        color: COLORS.ink,
      },
      {
        text: `Página ${index + 1} de ${sheets.length}`,
        x: RIGHT,
        y: footer,
        size: BODY,
        bold: false,
        align: "right",
        color: COLORS.ink,
      },
    );
    return {
      width: VOUCHER_PAGE_WIDTH,
      height: VOUCHER_PAGE_HEIGHT,
      rects: current.rects,
      images: current.images,
      rules: current.rules,
      texts: current.texts,
    };
  });
}
