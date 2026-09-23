/**
 * WHERE EACH DATUM FALLS ON THE CHECK — pure, and therefore testable without a PDF.
 *
 * The page IS the check (170 × 76 mm by default), not an A4 with a check drawn inside it: printed from
 * the manual tray at «tamaño real», the position then does not depend on how a printer centres a large
 * sheet. Measures are stored in MILLIMETRES — what one reads with a ruler on the form — and converted
 * to points here, the one place that knows `mm × 72 / 25.4`.
 *
 * **The default is measured, not chosen.** The two real checks the firm printed (ENI ECUADOR,
 * CAIZA VANESSA) are 481.89 × 215.43 pt, Helvetica 10 pt, and every datum's BASELINE falls on a round
 * millimetre: amount 128 · 13, payee 34 · 25, words 22 · 34, place 12 · 46. That is why `y` is the
 * baseline and not the top — it is how the tool that made them counted.
 *
 * What is printed is only the four data: no border, no label. The form brings those.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import type { MeasureText, PrintPage, PrintRect, PrintText } from "./types";
import { amountInWords } from "./words";

/** One datum's place on the form, in mm from the check's top-left corner. `y` is the BASELINE;
 *  `width` is the room it has before it shrinks. */
export interface CheckFieldPosition {
  x: number;
  y: number;
  width: number;
}

export type CheckField = "amount" | "payee" | "words" | "place";

export interface CheckLayout extends Record<CheckField, CheckFieldPosition> {
  /** The check's size, mm. */
  width: number;
  height: number;
  /** Points. */
  fontSize: number;
  /** What precedes the date: «Quito, 22 de septiembre de 2026». */
  city: string;
  /** The printer's CALIBRATION, mm: shifts all four data at once, never the form's outline. */
  offsetX: number;
  offsetY: number;
}

export const CHECK_FIELDS: readonly CheckField[] = ["amount", "payee", "words", "place"];

export const CHECK_FIELD_LABELS: Record<CheckField, string> = {
  amount: "Monto",
  payee: "Beneficiario",
  words: "Monto en letras",
  place: "Lugar y fecha",
};

export const DEFAULT_CHECK_LAYOUT: CheckLayout = {
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

/** A stored layout — possibly saved before a field existed — completed with the default. */
export function resolveCheckLayout(stored: Partial<CheckLayout> | undefined): CheckLayout {
  const layout: CheckLayout = { ...DEFAULT_CHECK_LAYOUT, ...stored };
  for (const field of CHECK_FIELDS) {
    layout[field] = { ...DEFAULT_CHECK_LAYOUT[field], ...stored?.[field] };
  }
  return layout;
}

export const mmToPt = (mm: number) => (mm * 72) / 25.4;

/** The smallest a datum shrinks to before the words split in two lines: 70 % of the size. */
const MIN_SCALE = 0.7;
const SHRINK_STEP = 0.5;
/** From the first line of the words to the second, as a multiple of the size. */
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

/** The largest size ≥ 70 % that fits `width`, or `null` when not even that does. */
function fittingSize(
  text: string,
  width: number,
  size: number,
  measure: MeasureText,
): number | null {
  for (let candidate = size; candidate >= size * MIN_SCALE - 1e-9; candidate -= SHRINK_STEP) {
    if (measure(text, candidate, false) <= width) {
      return candidate;
    }
  }
  return null;
}

/** Splits `text` by words into two lines as balanced as the width allows: the first as full as it
 *  fits, the rest on the second. */
function splitInTwo(text: string, width: number, size: number, measure: MeasureText): string[] {
  const words = text.split(" ");
  let first = "";
  let index = 0;
  for (; index < words.length; index += 1) {
    const candidate = first ? `${first} ${words[index]}` : words[index];
    if (first && measure(candidate, size, false) > width) {
      break;
    }
    first = candidate;
  }
  const rest = words.slice(index).join(" ");
  return rest ? [first, rest] : [first];
}

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
  const size = layout.fontSize;
  const texts: PrintText[] = [];
  const rects: PrintRect[] = [];

  const put = (field: CheckField, value: string) => {
    const position = layout[field];
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

    const fitted = fittingSize(value, width, size, measure);
    if (fitted !== null) {
      texts.push(text(value, fitted, y));
    } else if (field === "words") {
      // Only the words are long enough to need a second line; the other three keep the smallest size.
      splitInTwo(value, width, size, measure).forEach((line, index) =>
        texts.push(text(line, size, y + index * size * LINE_PITCH)),
      );
    } else {
      texts.push(text(value, size * MIN_SCALE, y));
    }

    if (guides) {
      rects.push({ x, y: y - size, width, height: size * LINE_PITCH, stroke: GUIDE });
      texts.push({
        text: CHECK_FIELD_LABELS[field].toUpperCase(),
        x,
        y: y - size - 1.5,
        size: GUIDE_LABEL_SIZE,
        bold: true,
        align: "left",
        color: GUIDE,
      });
    }
  };

  put("amount", checkAmountText(input.amount));
  put("payee", input.payee.trim().toUpperCase());
  put("words", amountInWords(input.amount));
  put("place", checkPlaceText(layout.city, input.date));

  const width = mmToPt(layout.width);
  const height = mmToPt(layout.height);
  if (guides) {
    rects.unshift({ x: 0.5, y: 0.5, width: width - 1, height: height - 1, stroke: GUIDE });
  }
  return { width, height, rects, images: [], rules: [], texts };
}
