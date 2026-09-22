/**
 * The ONE definition of a document's age. Contífico writes the buckets into its file, and they are
 * true only on the day of the download — the same defect Reportería corrected of the workbook it
 * replaced (a figure frozen at the date it was copied). Here the buckets are a FUNCTION of the due
 * date and the date one looks from (the bar's cut date), and the grid, the tiles, the Excel,
 * Resumen and the flow all ask this function. Nothing of it is stored.
 *
 * The rule, as the `FORMATO IDEAL` lays it out: a document is VENCIDA when its due date is before
 * `asOf`, POR VENCER otherwise (the due day itself is still «por vencer»); on either side the bucket
 * is the number of days, in steps of thirty (1–30 → 30, 31–60 → 60, … , 121+ → «120+»). A document
 * with no due date counts as por vencer with no bucket to speak of, so it is placed in the first.
 */
import { daysBetween } from "./dates";

export type AgingSide = "due" | "overdue";
export type AgingBucket = 30 | 60 | 90 | 120 | "120+";

export const AGING_BUCKETS: readonly AgingBucket[] = [30, 60, 90, 120, "120+"];

export interface Aging {
  side: AgingSide;
  bucket: AgingBucket;
  /** Signed: negative for days still to go, positive for days overdue. */
  days: number;
}

export function bucketOf(days: number): AgingBucket {
  if (days <= 30) {
    return 30;
  }
  if (days <= 60) {
    return 60;
  }
  if (days <= 90) {
    return 90;
  }
  if (days <= 120) {
    return 120;
  }
  return "120+";
}

export function agingOf(dueOn: string | null, asOf: string): Aging {
  if (!dueOn) {
    return { side: "due", bucket: 30, days: 0 };
  }
  const days = daysBetween(dueOn, asOf);
  if (days > 0) {
    return { side: "overdue", bucket: bucketOf(days), days };
  }
  return { side: "due", bucket: bucketOf(-days), days };
}

/** «Por vencer 30 días» · «Vencida por >120 días» — the label the chips and the Excel headers use. */
export function agingLabel(aging: Pick<Aging, "side" | "bucket">): string {
  const span = aging.bucket === "120+" ? ">120 días" : `${aging.bucket} días`;
  return aging.side === "overdue" ? `Vencida por ${span}` : `Por vencer ${span}`;
}

/**
 * «Vencida 30 d» · «Vence +120 d» — the grid's pill. One line, always: the long label wrapped to
 * two lines inside the document cell and truncated the document NUMBER to make room, which is the
 * one thing in the row that identifies the document.
 */
export function agingShortLabel(aging: Pick<Aging, "side" | "bucket">): string {
  const span = aging.bucket === "120+" ? "+120 d" : `${aging.bucket} d`;
  return aging.side === "overdue" ? `Vencida ${span}` : `Vence ${span}`;
}

export function agingSideLabel(side: AgingSide): string {
  return side === "overdue" ? "Vencida" : "Por vencer";
}
