/**
 * WHERE EACH DATUM FALLS ON THE CHECK — pure, and therefore testable without a PDF.
 *
 * The standard page IS the check (170 × 76 mm); Pichincha uses the landscape A4 of its supplied PDF.
 * Measures are stored in MILLIMETRES — what one reads with a ruler on the form — and converted
 * to points here, the one place that knows `mm × 72 / 25.4`.
 *
 * **The default is measured, not chosen.** The two real checks the firm printed (ENI ECUADOR,
 * CAIZA VANESSA) are 481.89 × 215.43 pt, Helvetica 10 pt, and every datum's BASELINE falls on a round
 * millimetre: amount 128 · 13, payee 34 · 25, words 22 · 34, place 12 · 46. That is why `y` is the
 * baseline and not the top — it is how the tool that made them counted.
 *
 * No borders or labels are printed. Pichincha also prints its protective asterisk line.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { normalizeLabel } from "@/lib/workspaces";
import type { MeasureText, PrintPage, PrintRect, PrintText } from "./types";
import { amountInWords } from "./words";

/** One datum's place on the form, in mm from the check's top-left corner. `y` is the BASELINE;
 *  `width` is the available room; overflowing data is rejected without resizing. */
export interface CheckFieldPosition {
  x: number;
  y: number;
  width: number;
}

export type CheckField = "amount" | "payee" | "words" | "place";

export interface CheckLayout extends Record<CheckField, CheckFieldPosition> {
  format: "standard" | "pichincha";
  /** The PDF paper size, mm. */
  width: number;
  height: number;
  /** Points. */
  fontSize: number;
  /** What precedes the date: «Quito, 22 de septiembre de 2026». */
  city: string;
  /** The printer's CALIBRATION, mm: shifts all four data at once, never the form's outline. */
  offsetX: number;
  offsetY: number;
  /** Pichincha's separate protective asterisk line. */
  filler?: CheckFieldPosition;
}

export const CHECK_FIELDS: readonly CheckField[] = ["amount", "payee", "words", "place"];

export const CHECK_FIELD_LABELS: Record<CheckField, string> = {
  amount: "Monto",
  payee: "Beneficiario",
  words: "Monto en letras",
  place: "Lugar y fecha",
};

export const DEFAULT_CHECK_LAYOUT: CheckLayout = {
  format: "standard",
  width: 170,
  height: 76,
  fontSize: 10,
  city: "Quito",
  offsetX: 0,
  offsetY: 0,
  amount: { x: 128, y: 13, width: 38 },
  payee: { x: 34, y: 25, width: 130 },
  words: { x: 22, y: 34, width: 144 },
  place: { x: 12, y: 46, width: 110 },
};

const ptToMm = (pt: number) => (pt * 25.4) / 72;

/** Measured from Movimiento_20Bancario_20202609000297.pdf, including its (6, 33.68504 pt)
 * translation. Field widths reserve room on that sheet; words fit 46 trailing asterisks for
 * the reference amount, and the separate line fits 95. Never scale or recenter this onto a check. */
export const PICHINCHA_CHECK_LAYOUT: CheckLayout = {
  format: "pichincha",
  width: ptToMm(841.8898),
  height: ptToMm(595.2756),
  fontSize: 10,
  city: "Ambato",
  offsetX: 0,
  offsetY: 0,
  amount: { x: ptToMm(765.3543 + 6), y: ptToMm(595.2756 - 303.3071 - 33.68504), width: 22 },
  payee: { x: ptToMm(456.378 + 6), y: ptToMm(595.2756 - 303.3071 - 33.68504), width: 107 },
  words: { x: ptToMm(456.378 + 6), y: ptToMm(595.2756 - 283.4646 - 33.68504), width: 122 },
  place: { x: ptToMm(411.0236 + 6), y: ptToMm(595.2756 - 252.2835 - 33.68504), width: 110 },
  filler: { x: ptToMm(408.189 + 6), y: ptToMm(595.2756 - 263.622 - 33.68504), width: 130.37 },
};

export function defaultCheckLayout(bank: string): CheckLayout {
  const name = normalizeLabel(bank);
  return name === "pichincha" || name === "banco pichincha"
    ? PICHINCHA_CHECK_LAYOUT
    : DEFAULT_CHECK_LAYOUT;
}

/** Saved custom layouts take precedence. Legacy customizations predate bank formats and retain
 * their standard format until explicitly reset. Unsaved accounts inherit their bank's default. */
export function resolveCheckLayout(
  stored: Partial<CheckLayout> | undefined,
  bank = "",
): CheckLayout {
  const defaults =
    stored && Object.keys(stored).length > 0
      ? stored.format === "pichincha"
        ? PICHINCHA_CHECK_LAYOUT
        : DEFAULT_CHECK_LAYOUT
      : defaultCheckLayout(bank);
  const layout: CheckLayout = { ...defaults, ...stored };
  for (const field of CHECK_FIELDS) {
    layout[field] = { ...defaults[field], ...stored?.[field] };
  }
  if (defaults.filler) {
    layout.filler = { ...defaults.filler, ...stored?.filler };
  }
  return layout;
}

export const mmToPt = (mm: number) => (mm * 72) / 25.4;

const LINE_PITCH = 1.3;

const INK = "#000000";
const GUIDE = "#94a3b8";
const GUIDE_LABEL_SIZE = 5.5;

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `**9,200.00**`: no «$» (the form brings «US$») and asterisks on both sides, so nobody can add a
 *  digit before or after. */
export function checkAmountText(amount: number): string {
  return `**${AMOUNT.format(Math.abs(amount))}**`;
}

/** «Quito, 22 de septiembre de 2026». */
export function checkPlaceText(city: string, iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const monthName = MONTHS_FULL_ES[month - 1]?.toLowerCase() ?? String(month);
  const date = `${day} de ${monthName} de ${year}`;
  return city.trim() ? `${city.trim()}, ${date}` : date;
}

export interface CheckPrintInput {
  payee: string;
  amount: number;
  /** ISO date. The caller resolves a missing emission date to the cut date. */
  date: string;
}

/** The data the alignment test prints: long enough to show where each field runs out of room. */
export const SAMPLE_CHECK: Omit<CheckPrintInput, "date"> = {
  payee: "BENEFICIARIO DE EJEMPLO S.A.",
  amount: 9200,
};

/**
 * The check as a page: the four data at the layout's positions, shifted by its calibration. With
 * `guides`, the SAME page plus the form's outline and a labelled box per field — one route of
 * positions, so the test and the check cannot disagree.
 */
export function placeCheck(
  input: CheckPrintInput,
  layout: CheckLayout,
  measure: MeasureText,
  { guides = false }: { guides?: boolean } = {},
): PrintPage {
  const positive = [
    layout.width,
    layout.height,
    layout.fontSize,
    ...CHECK_FIELDS.map((field) => layout[field].width),
    ...(layout.filler ? [layout.filler.width] : []),
  ];
  const coordinates = [
    layout.offsetX,
    layout.offsetY,
    ...CHECK_FIELDS.flatMap((field) => [layout[field].x, layout[field].y]),
    ...(layout.filler ? [layout.filler.x, layout.filler.y] : []),
  ];
  if (
    positive.some((value) => !Number.isFinite(value) || value <= 0) ||
    coordinates.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      "Revisa el formato del banco: las dimensiones, los anchos y el tamaño de letra deben ser positivos y las posiciones válidas.",
    );
  }
  const size = layout.fontSize;
  const texts: PrintText[] = [];
  const rects: PrintRect[] = [];

  const put = (field: CheckField | "filler", value: string) => {
    const position = layout[field];
    if (!position) return;
    const label = field === "filler" ? "Relleno de seguridad" : CHECK_FIELD_LABELS[field];
    const x = mmToPt(position.x + layout.offsetX);
    const y = mmToPt(position.y + layout.offsetY);
    const width = mmToPt(position.width);
    const text = (line: string, lineSize: number, baseline: number): PrintText => ({
      text: line,
      x,
      y: baseline,
      size: lineSize,
      bold: false,
      align: "left",
      color: INK,
    });

    if (measure(value, size, false) > width) {
      throw new Error(
        `${label} no cabe en el ancho configurado. Revisa el dato o el formato de cheque de esta cuenta.`,
      );
    }
    if (
      x < 0 ||
      y - size < 0 ||
      x + width > mmToPt(layout.width) ||
      y + size * 0.25 > mmToPt(layout.height)
    ) {
      throw new Error(
        `${label} queda fuera del cheque con las medidas y la calibración configuradas.`,
      );
    }
    texts.push(text(value, size, y));

    if (guides) {
      rects.push({ x, y: y - size, width, height: size * LINE_PITCH, stroke: GUIDE });
      texts.push({
        text: label.toUpperCase(),
        x,
        y: y - size - 1.5,
        size: GUIDE_LABEL_SIZE,
        bold: true,
        align: "left",
        color: GUIDE,
      });
    }
  };

  const pichincha = layout.format === "pichincha";
  const fill = (text: string, width: number) => {
    const available = mmToPt(width) - measure(text, size, false);
    const count = Math.max(0, Math.floor((available + 1e-9) / measure("*", size, false)));
    return text + "*".repeat(count);
  };
  put(
    "amount",
    pichincha
      ? `$${(Math.round(Math.abs(input.amount) * 100) / 100).toFixed(2).replace(".", ",")}`
      : checkAmountText(input.amount),
  );
  put("payee", input.payee.trim().toUpperCase());
  const words = amountInWords(input.amount);
  put(
    "words",
    pichincha ? fill(words[0] + words.slice(1).toLowerCase(), layout.words.width) : words,
  );
  put(
    "place",
    pichincha
      ? [layout.city.trim(), input.date.replaceAll("-", "/")].filter(Boolean).join(", ")
      : checkPlaceText(layout.city, input.date),
  );
  if (pichincha && layout.filler) {
    put("filler", fill("", layout.filler.width));
  }

  const width = mmToPt(layout.width);
  const height = mmToPt(layout.height);
  if (guides) {
    rects.unshift({ x: 0.5, y: 0.5, width: width - 1, height: height - 1, stroke: GUIDE });
  }
  return { width, height, rects, images: [], rules: [], texts };
}
