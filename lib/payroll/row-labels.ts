/**
 * WHAT A ROL ROW IS CALLED — the only resolution, and the only validation, of a label.
 *
 * The catalogue (`concepts.ts`) declares the book's labels: the screen one (`label`) and the payslip's
 * verbatim one (`payslipLabel`). This file is what lets an employee write their own over it, and it
 * exists because `E-11 OTROS` is a wildcard: it is the book's `AH` column, it means different things
 * in different employees, and the payslip each of them signs printed the COLUMN's name instead of the
 * deduction's name.
 *
 * It lives apart from `concepts.ts` on purpose: that one declares a CONSTANT with no dependencies on
 * what is typed, and this is a function of the capture. Fusing them would make the catalogue import
 * the type of what is captured, which is precisely the opposite direction.
 *
 * An own label overrides BOTH of the book's labels. Overriding only the screen one would leave the
 * payslip —the paper the employee signs, which is the reason for all of this— saying `OTROS`.
 */
import { normalizeEntityName, normalizeLabel } from "@/lib/workspaces";
import type { EntityNameCheck } from "@/lib/workspaces";
import type { ConceptBase, DeductionConcept, IncomeConcept } from "./concepts";
import type { PayrollMonthlyCapture } from "./types";

/** A catalogue concept, from either of the two tables. */
export type CatalogueConcept = IncomeConcept | DeductionConcept;

/**
 * Whether this row admits an own label: only the ones that TYPE THEIR AMOUNT.
 *
 * It is not `isChoosable`, which already exists in `concepts.ts` and returns `true` for the three
 * overtime rows too: those are `calculado` —the engine derives their value— and they capture their
 * QUANTITY, but their label is a statutory rate. Renaming them would allow labelling `50%` as `100%`
 * over a computation that is still at 50 %, and that is a lie no figure gives away.
 */
export function isRenameable(concept: CatalogueConcept): boolean {
  return concept.kind === "capturado";
}

/** The stored own label, already trimmed, or `null` if this row is called what the book calls it. */
function ownLabel(concept: CatalogueConcept, capture: PayrollMonthlyCapture): string | null {
  if (!isRenameable(concept)) {
    return null;
  }
  const raw = capture.labels?.[concept.code]?.trim();
  return raw ? raw : null;
}

/** What this row is called ON SCREEN for this employee. */
export function labelFor(concept: CatalogueConcept, capture: PayrollMonthlyCapture): string {
  return ownLabel(concept, capture) ?? concept.label;
}

/**
 * What this row is called ON THE PAYSLIP. In capitals, which is the convention of every
 * `payslipLabel` of the catalogue — an own label in lower case would break the rhythm of the 26 rows.
 */
export function payslipLabelFor(
  concept: ConceptBase & { kind: "calculado" | "capturado" },
  capture: PayrollMonthlyCapture,
): string {
  const own = ownLabel(concept as CatalogueConcept, capture);
  return own ? own.toUpperCase() : concept.payslipLabel;
}

/** A row and its effective label. The `key` is the concept's code or the bonus row's `id`: it is what
 *  allows excluding from the check the row being renamed. */
export interface RowLabelRef {
  key: string;
  label: string;
}

/**
 * ALL the labels this employee has in sight — the concepts passed in, with their effective label,
 * plus their bonus rows.
 *
 * It is the universe uniqueness is judged against, and that is why the scope is no longer the período:
 * what this rule protects is that two rows of the SAME payslip are not called the same, because then
 * whoever reviews it cannot tell which is which. Two employees calling their row `Uniformes` is
 * legitimate and always was.
 */
export function rowLabelUniverse(
  capture: PayrollMonthlyCapture,
  concepts: readonly CatalogueConcept[],
): RowLabelRef[] {
  return [
    ...concepts.map((concept) => ({ key: concept.code, label: labelFor(concept, capture) })),
    ...(capture.extras ?? []).map((row) => ({ key: row.id, label: row.label })),
  ];
}

/**
 * Validates a row's label against that employee's other rows.
 *
 * It leans on the generic rules of `lib/workspaces.ts` —non-empty, a cap of 60, comparison ignoring
 * case and accents— which PyG's clients and Ocupaciones' hotels already use, instead of opening a
 * third definition of «this name is already taken».
 *
 * `selfKey` is the row being renamed: without it, leaving a label as it is would clash with itself.
 */
export function validateRowLabel(
  raw: string,
  taken: readonly RowLabelRef[],
  selfKey?: string,
): EntityNameCheck {
  const check = normalizeEntityName(raw, "concepto");
  if (!check.ok) {
    return check;
  }
  const normalized = normalizeLabel(check.name);
  const clash = taken.find(
    (row) => row.key !== selfKey && normalizeLabel(row.label) === normalized,
  );
  return clash
    ? { ok: false, message: `Este empleado ya tiene una fila llamada «${clash.label}».` }
    : check;
}

/**
 * Writes —or deletes— a catalogue row's own label.
 *
 * An empty name DELETES the entry instead of storing it empty: a row with no own label is called what
 * the book calls it, and storing `""` would claim somebody named it that.
 */
export function withRowLabel(
  labels: Readonly<Record<string, string>> | undefined,
  code: string,
  name: string,
): Record<string, string> {
  const next = { ...(labels ?? {}) };
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed) {
    next[code] = trimmed;
  } else {
    delete next[code];
  }
  return next;
}

/**
 * Removes a row's own label. It is called on REMOVING the row, together with its amount and in the
 * same write: an orphan label would come back to life on adding that concept again, putting another
 * month's name on a new figure.
 */
export function withoutRowLabel(
  labels: Readonly<Record<string, string>> | undefined,
  code: string,
): Record<string, string> {
  const next = { ...(labels ?? {}) };
  delete next[code];
  return next;
}
