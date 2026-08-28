/**
 * The rule of whether a rol de pagos can land in the período that is open — pure, because it is the
 * only thing that separates loading the right month from silently overwriting another month.
 *
 * The file DECLARES its own period (`GENERAL!B2`, see `rol-general.ts`), so nothing is guessed here:
 * either it matches the open período or it does not, and if it does not, it is REJECTED naming BOTH
 * months. Naming only one («this file does not correspond to this período») leaves the accountant
 * comparing their folder against the screen blind; naming both turns the rejection into the
 * instruction of what to do next.
 *
 * The file's razón social is NOT compared against the client's name. It is the same resolution PyG
 * and Ocupaciones already hold: the user calls «Manor Galápagos» what the file calls `HOTEL BOUTIQUE
 * CULTURA MANOR`, and the label they chose is not an identity to contradict.
 */
import { periodLongLabel } from "../periods";

export interface PeriodRef {
  year: number;
  monthIndex: number;
}

export type RosterImportVerdict = { ok: true } | { ok: false; message: string };

function samePeriod(a: PeriodRef, b: PeriodRef): boolean {
  return a.year === b.year && a.monthIndex === b.monthIndex;
}

/**
 * `file` is the period the file declares; `target`, the one that is open; `existing`, the períodos
 * the client already has registered — it serves so the rejection knows whether the right destination
 * already exists («open it there») or does not yet («register it»), instead of giving the same phrase
 * for two situations that are resolved differently.
 */
export function verifyRosterTarget(
  file: PeriodRef,
  target: PeriodRef,
  existing: readonly PeriodRef[],
): RosterImportVerdict {
  if (samePeriod(file, target)) {
    return { ok: true };
  }

  const fileLabel = periodLongLabel(file.year, file.monthIndex);
  const targetLabel = periodLongLabel(target.year, target.monthIndex);
  const registered = existing.some((period) => samePeriod(period, file));

  return {
    ok: false,
    message: registered
      ? `Este archivo es el rol de ${fileLabel} y lo estás cargando en ${targetLabel}. Abre ${fileLabel}, que ya está registrado, y cárgalo ahí.`
      : `Este archivo es el rol de ${fileLabel} y lo estás cargando en ${targetLabel}. Registra el período ${fileLabel} y cárgalo ahí.`,
  };
}
