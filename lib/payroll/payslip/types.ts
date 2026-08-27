/**
 * THE PAYSLIP AS FLAT DATA, and the boxes it is drawn in.
 *
 * `PayslipDocument` is the accountant's book `INDIVIDUAL` sheet reduced to text: its header lines,
 * its identity fields, its rows with the amount ALREADY formatted, its three totals and its footer.
 * That the amounts arrive here as strings is deliberate — it is what allows asserting in a test that
 * a zero prints as `-` and that a total carries `US$`, comparing strings against the Excel instead of
 * numbers against another computation.
 *
 * `PayslipBox` is that document already placed: one box per text, with its position, its size and its
 * alignment. `render.ts` walks them and draws them without deciding anything.
 */
import type { EntityLogo } from "@/lib/logos";

/** A concept row of the payslip. `quantity` is the `Cantidad` column, which is only filled by the
 *  three overtime ones (with the number of hours) and the two marked `(*)`. */
export interface PayslipRow {
  /** The catalogue's code. It is not printed: it is there so a test can name the row that fails. */
  code: string;
  label: string;
  /** `null` on the rows that do not use it, which is almost all of them. */
  quantity: string | null;
  value: string;
}

export interface PayslipDocument {
  /** Row 1 of the payslip: the company, and its cost center if it declared one —«Delicmar · Planta
   *  Ambato», already composed by `costCenterHeading`. */
  company: string;
  /**
   * The logo that heads on the LEFT, in front of `company`: the client's. Who occupies each side was
   * already decided by `letterheadLogos`, which is the app's only rule for that: this document does
   * not ask again, and that is why the layout does not have to know cost centers exist.
   */
  logo?: EntityLogo;
  /** The RIGHT-hand one, above the title: the cost center's. Absent in every client that does not
   *  declare one with a logo, which is what leaves its payslip as it was. */
  rightLogo?: EntityLogo;
  /**
   * The letterhead under the name: razón social, location, phone numbers and email, ALREADY composed
   * by `letterheadLines`. They arrive as lines and not as fields for the same reason the amounts
   * arrive formatted — this document is plain text, and composing an address here would open a second
   * version of how it is written, capable of drifting from the screen's and the Excel's.
   *
   * Empty when the client has no profile, and then the header stays as it was.
   */
  companyLines: readonly string[];
  /** `ROL DE PAGOS` */
  title: string;
  /** `MES: MARZO 2026` */
  period: string;
  /** `Codigo: 6` */
  codeLine: string;
  /** `Dias Trabajados: 30` */
  daysLine: string;
  /** `FR=0` */
  reserveFundLine: string;
  employeeName: string;
  role: string;
  /** Only the rows WITH an amount, in the book's column order. */
  incomes: readonly PayslipRow[];
  deductions: readonly PayslipRow[];
  /** The note that explains the `(*)`, or `null` when no printed row carries it. It is decided here
   *  and not in the layout because it depends on which rows survived the omission. */
  footnote: string | null;
  /** `US$567.98` */
  totalIncome: string;
  /** `US$246.04` */
  totalDeductions: string;
  /** `US$321.94` */
  netPay: string;
  /** `C.C. 1723220065` */
  idCardLine: string;
}

export type PayslipAlign = "left" | "right" | "center";

export interface PayslipBox {
  text: string;
  /** Points from the page's LEFT edge. With `align: "right"` it is the box's right edge, and with
   *  `align: "center"`, its axis. */
  x: number;
  /** Points from the page's TOP edge — the opposite of pdf-lib, which measures from the bottom.
   *  The conversion is done by `render.ts`, which is where the format's coordinate system lives;
   *  here it counts downwards because that is how a payslip is read. */
  y: number;
  size: number;
  bold: boolean;
  align: PayslipAlign;
  /** Hex de `palette.ts`. */
  color: string;
}

/** A horizontal line of the payslip (a block's separator, the signature line). */
export interface PayslipRule {
  x1: number;
  x2: number;
  y: number;
  thickness: number;
  color: string;
}

/** A background rectangle: a section's band, the identity panel, a row's alternating stripe. They are
 *  ALL drawn before the text, so none of them can cover it. */
export interface PayslipFill {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/**
 * The client's logo, already placed. It is the only primitive that is neither text nor flat geometry,
 * and it reaches here with its size ALREADY resolved: `layout.ts` computes it from the dimensions the
 * logo carries stored, so placing it does not force decoding the image — which is what allows
 * asserting in a test that it does not invade the company's block without generating any PDF.
 */
export interface PayslipImage {
  dataUrl: string;
  /** What decides between `embedPng` and `embedJpg` in `render.ts`. */
  mime: "image/png" | "image/jpeg";
  x: number;
  /** Points from the TOP edge, like the rest of this layer. */
  y: number;
  width: number;
  height: number;
}

export interface PayslipPage {
  fills: readonly PayslipFill[];
  rules: readonly PayslipRule[];
  /** Empty unless the client has a logo. They are drawn along with the fills, before the text. */
  images: readonly PayslipImage[];
  boxes: readonly PayslipBox[];
}

/** Measures a text in points. It is injected so the geometry layer does not import `pdf-lib`:
 *  `render.ts` passes it `font.widthOfTextAtSize` and the test, a measurer of known widths. */
export type MeasureText = (text: string, size: number, bold: boolean) => number;
