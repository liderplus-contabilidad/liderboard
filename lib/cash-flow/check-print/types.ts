/**
 * A PRINTED PAGE AS FLAT GEOMETRY — what both layouts of this folder (the check and the comprobante)
 * return and the one thing `render.ts` knows how to draw. The same split the payslip uses
 * (`lib/payroll/payslip/`): every position is decided in a pure layer, and the one file that touches
 * `pdf-lib` decides nothing.
 *
 * Every unit is the PDF POINT, counted from the page's TOP-left corner — how a document is read.
 * `render.ts` is the one place that flips it to pdf-lib's bottom-up axis.
 */
import type { EntityLogo } from "@/lib/logos";

export type PrintAlign = "left" | "right" | "center";

export interface PrintText {
  text: string;
  /** With `align: "right"` the right edge; with `"center"`, the axis. */
  x: number;
  /** The BASELINE, not the top: a check is calibrated against the line the bank printed for it. */
  y: number;
  size: number;
  bold: boolean;
  align: PrintAlign;
  color: string;
}

/** A rectangle: filled, outlined, or both. Drawn before the text, so it never covers it. */
export interface PrintRect {
  x: number;
  /** The TOP edge. */
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
}

export interface PrintRule {
  x1: number;
  x2: number;
  y: number;
  thickness: number;
  color: string;
}

export interface PrintImage {
  logo: EntityLogo;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintPage {
  width: number;
  height: number;
  rects: readonly PrintRect[];
  images: readonly PrintImage[];
  rules: readonly PrintRule[];
  texts: readonly PrintText[];
}

/** Measures a text in points. Injected so the layouts do not import `pdf-lib`: `render.ts` passes
 *  `font.widthOfTextAtSize`, the tests a measurer of known widths. */
export type MeasureText = (text: string, size: number, bold: boolean) => number;
