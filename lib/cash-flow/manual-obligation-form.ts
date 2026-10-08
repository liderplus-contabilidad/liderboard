import { parseDateInput } from "@/lib/date-input";
import { normalizeKind } from "./derive";

export interface ManualObligationFormValues {
  supplier: string;
  kind: string;
  amount: number | null;
  dueOn: string;
}

export type ManualObligationFormErrors = Partial<Record<keyof ManualObligationFormValues, string>>;

/** Field errors stay attached to their inputs; persistence failures belong to the form itself. */
export function validateManualObligationForm(
  values: ManualObligationFormValues,
): ManualObligationFormErrors {
  const errors: ManualObligationFormErrors = {};
  if (!values.supplier.trim()) errors.supplier = "Escribe el concepto o el beneficiario.";
  if (!normalizeKind(values.kind)) errors.kind = "Escribe el nombre de la clase nueva.";
  if (values.amount === null || !Number.isFinite(values.amount) || values.amount <= 0) {
    errors.amount = "Escribe un monto mayor que cero.";
  }
  if (values.dueOn.trim() && !parseDateInput(values.dueOn)) {
    errors.dueOn = "Escribe una fecha válida en formato dd/mm/aaaa.";
  }
  return errors;
}
