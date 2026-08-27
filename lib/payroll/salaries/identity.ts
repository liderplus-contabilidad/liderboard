/**
 * What tells that two records of DIFFERENT PERÍODOS are the same person.
 *
 * It is needed because each período stores its own `PayrollEmployeeLine`: copying the previous month's
 * nómina creates new rows with a new `id` (see `roster.ts`), and an upload replaces them entirely.
 * Without a stable key, «SANDOVAL» would be three rows of one month each and the salaries-by-area
 * screen could not show anybody's evolution.
 *
 * The key is the **cédula**, and the **name** only when the record does not bring one. The split is
 * not arbitrary: a manual creation already requires the cédula and rejects a duplicate within the
 * período (`validateEmployeeForm`), so where it exists it is trustworthy; the importer, on the other
 * hand, writes whatever the file says without requiring it, and a cédula-only rule would leave
 * anonymous rows the accountant cannot read.
 *
 * The two keys live in SEPARATE SPACES —the prefix is what separates them— so a record with no cédula
 * never fuses with one that does declare it even if the name matches: they are two different pieces of
 * evidence, and mixing them would invent a match nobody asserted.
 *
 * What this rule does NOT attempt: deciding which is the right one when two records of the same month
 * repeat a cédula. There it would add two costs into one row, and the symptom —a row with two job
 * titles alternating— is visible on screen. Within a período that is already rejected by the form.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { ParsedPayrollEmployeeLine } from "../types";

/** The minimum needed to identify somebody: the whole record is not required so the key can be
 *  computed over any projection of it. */
export type EmployeeIdentityFields = Pick<ParsedPayrollEmployeeLine, "name" | "idCard">;

/**
 * The key to group the records of one same person across several períodos.
 *
 * It returns `null` only when the record has NEITHER cédula NOR name, which is a row with nothing to
 * identify it by: the caller decides what to do with it (the screen discards it, because a row with no
 * label cannot be read).
 */
export function employeeKey(line: EmployeeIdentityFields): string | null {
  const idCard = line.idCard.trim();
  if (idCard !== "") {
    return `cedula:${idCard}`;
  }
  const name = normalizeLabel(line.name);
  return name === "" ? null : `nombre:${name}`;
}
