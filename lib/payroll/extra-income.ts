/**
 * THE BONUS ROWS AN EMPLOYEE DECLARES IN THEIR MONTH, on top of the book's thirteen income items.
 *
 * Each company's rol names its own: DELICMAR's book brings `MOVILIZACION NO APORTABLE`, `ALIMENTACION
 * NO APORTABLE` and `BONO NO APORTABLE` where Cultura Manor's brings viáticos, comisión fija and bono
 * cumplimiento. They are not concepts to add to the catalogue —the next client will bring another
 * three— but the SAME concept declared with different names, and the only thing the computation looks
 * at about them is the CLASS.
 *
 * This file is the pure layer of that idea: summing by class, checking the two caps and the four
 * operations over the list of rows. It knows nothing of Dexie or React, and none of its functions
 * touches the engine: what the engine receives are the two aggregates `sumExtraIncome` returns. How a
 * label is VALIDATED is not here but in `row-labels.ts`, which is where the label of every row of the
 * rol is resolved — a bonus's is not judged by any rule other than `E-11 Otros`'s.
 */
import { MAX_ENTITY_NAME_LENGTH } from "@/lib/workspaces";
import { sameToTheCentavo } from "./amounts";
import type { ExtraIncomeTotals } from "./engine/types";
import type { PayrollExtraConceptKind, PayrollExtraRow } from "./types";

export type { ExtraIncomeTotals };

export { MAX_ENTITY_NAME_LENGTH as MAX_EXTRA_CONCEPT_LABEL_LENGTH };

/**
 * The cap on the NON-contributory ones: 20 % of the unified salary.
 *
 * It does not come from a formula of the book but from two cells the accountant writes BY HAND at the
 * foot of the salary column —`48.20 / 20%` over `241.00`, `100.00 / 20%` over `500.00`—, and that is
 * why where it comes from is noted: if the firm moves it, it moves here and nowhere else.
 */
export const NON_CONTRIBUTORY_CAP_RATE = 0.2;

/** The cap on the CONTRIBUTORY ones: the whole unified salary. */
export const CONTRIBUTORY_CAP_RATE = 1;

/**
 * A período that declares no extra concept.
 *
 * `ExtraIncomeTotals` is declared in `engine/types.ts` —the engine's vocabulary— and this file is what
 * PRODUCES it: neither the list nor the labels reach the computation, because to the six bases three
 * contributory bonuses of 50 and one of 150 are indistinguishable.
 */
export const NO_EXTRA_INCOME: ExtraIncomeTotals = { contributory: 0, nonContributory: 0 };

/**
 * Sums the amounts of an employee's bonus rows by class.
 *
 * It walks the rows, which carry their amount inside, and that is why the orphan-amount figure the
 * previous version had to defend against no longer exists: when the declaration lived on the período
 * and the amount on the record, deleting one could leave the other. Here removing the row takes both
 * things because they are the same thing.
 */
export function sumExtraIncome(rows: readonly PayrollExtraRow[] | undefined): ExtraIncomeTotals {
  if (!rows || rows.length === 0) {
    return { ...NO_EXTRA_INCOME };
  }

  let contributory = 0;
  let nonContributory = 0;
  for (const row of rows) {
    if (row.kind === "aportable") {
      contributory += row.amount;
    } else {
      nonContributory += row.amount;
    }
  }
  return { contributory, nonContributory };
}

/** A cap that was exceeded: which class, how much it adds up to, how far it reached and by how much
 *  it went over. */
export interface ExtraCapBreach {
  kind: PayrollExtraConceptKind;
  total: number;
  cap: number;
  excess: number;
}

/**
 * The caps the firm sets over the UNIFIED SALARY (`F`).
 *
 * It is measured against `F` and not against `D · SUELDO BASE` because it is the column under which
 * the accountant wrote their own 20 %. With 30 days paid the two figures coincide, so no test tells
 * them apart; the day the firm says otherwise, it is one line.
 *
 * The SUM of each class is judged and not concept by concept: it is what the book's 20 % measures, and
 * three bonuses of 20 over a salary of 200 go over even though none does on its own.
 *
 * The excess is judged to the CENT (`sameToTheCentavo`, the module's only definition of «same
 * amount»): the unified salary is a rounded division and its 20 % falls in the middle of a bit, so an
 * exact comparison would warn about excesses of `1e-13` nobody can correct.
 *
 * It returns a LIST and not a boolean because both classes can go over at once and the notice has to
 * be able to name them separately. The contributory one goes first, which is the order the table
 * shows them in.
 */
export function extraCapBreaches(
  totals: ExtraIncomeTotals,
  unifiedSalary: number,
): ExtraCapBreach[] {
  const breaches: ExtraCapBreach[] = [];

  const check = (kind: PayrollExtraConceptKind, total: number, cap: number): void => {
    if (total > cap && !sameToTheCentavo(total, cap)) {
      breaches.push({ kind, total, cap, excess: total - cap });
    }
  };

  check("aportable", totals.contributory, unifiedSalary * CONTRIBUTORY_CAP_RATE);
  check("noAportable", totals.nonContributory, unifiedSalary * NON_CONTRIBUTORY_CAP_RATE);
  return breaches;
}

/** How each class is named on screen. Here and not in the component, for the same reason the
 *  catalogue's labels live in `concepts.ts`: two screens cannot call it differently. */
export const EXTRA_CONCEPT_KIND_LABEL: Record<PayrollExtraConceptKind, string> = {
  aportable: "Bono aportable",
  noAportable: "Bono no aportable",
};

/** The short version, the one that goes next to the name in the table — to the right of the field,
 *  where it competes with it for width. */
export const EXTRA_CONCEPT_KIND_SHORT: Record<PayrollExtraConceptKind, string> = {
  aportable: "Aportable",
  noAportable: "No aportable",
};

/**
 * The notice in plain Spanish, with the three figures needed to correct it: how much it adds up to,
 * how far it reached and by how much it went over.
 *
 * It lives in the pure layer and not in the component for the same reason as PyG's `describeShares`:
 * a notice's text is a claim about the figures and is tested with them. The amount's formatting is
 * set by whoever draws it — here the numbers are returned, not `$`.
 */
export function describeCapBreach(breach: ExtraCapBreach): {
  subject: string;
  rule: string;
} {
  return breach.kind === "noAportable"
    ? {
        subject: "Los bonos no aportables",
        rule: `el ${Math.round(NON_CONTRIBUTORY_CAP_RATE * 100)} % del sueldo unificado`,
      }
    : { subject: "Los bonos aportables", rule: "el sueldo unificado" };
}

/**
 * A freshly declared bonus row, with its default label.
 *
 * The `id` is derived from the ones already there instead of a random one: this layer is pure and
 * testable, and a `crypto.randomUUID()` here would force injecting or mocking it. It is enough for it
 * to be unique WITHIN that capture, which is the only place it is referenced.
 *
 * It is born WITH a name instead of empty because the label is unique among the employee's rows and
 * two rows with no name would clash with each other before anyone writes anything. The suffix is
 * looked for against the labels already taken, not against a counter, so deleting the 2 and creating
 * again does not give a 3.
 */
export function newExtraRow(
  kind: PayrollExtraConceptKind,
  existing: readonly PayrollExtraRow[],
  taken: readonly string[] = [],
): PayrollExtraRow {
  const ids = new Set(existing.map((row) => row.id));
  let n = existing.length + 1;
  while (ids.has(`x${n}`)) {
    n += 1;
  }

  const base = EXTRA_CONCEPT_KIND_LABEL[kind];
  const names = new Set(
    [...existing.map((row) => row.label), ...taken].map((label) => label.toLowerCase()),
  );
  let label = base;
  let suffix = 2;
  while (names.has(label.toLowerCase())) {
    label = `${base} ${suffix}`;
    suffix += 1;
  }

  return { id: `x${n}`, label, kind, amount: 0 };
}

/**
 * Removes a bonus row. It is a filter and nothing more: the amount goes with it because it lives
 * inside.
 *
 * The previous version also returned a `pruneAmounts` to clean the período's captures, which was the
 * expensive half of having the declaration and the amount in different structures.
 */
export function removeExtraRow(rows: readonly PayrollExtraRow[], rowId: string): PayrollExtraRow[] {
  return rows.filter((row) => row.id !== rowId);
}

/** Changes a row's label, without touching its amount or its class. */
export function renameExtraRow(
  rows: readonly PayrollExtraRow[],
  rowId: string,
  label: string,
): PayrollExtraRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, label } : row));
}

/** Changes a row's amount, without touching its label or its class. */
export function setExtraRowAmount(
  rows: readonly PayrollExtraRow[],
  rowId: string,
  amount: number,
): PayrollExtraRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, amount } : row));
}
