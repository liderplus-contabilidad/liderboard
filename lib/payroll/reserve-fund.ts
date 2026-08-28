/**
 * The TWO reserve-fund flags seen as ONE mode.
 *
 * The book crosses `FR` (`BA`, is entitled) with `AC FR` (`AZ`, accrues it at the IESS) and out of
 * that crossing come THREE results, not four (§7 of `docs/payroll/rol-de-pagos-formulas.md`): with no
 * entitlement it generates nothing · entitled and not accruing it is received as income (`U`) ·
 * entitled and accruing it goes to the employer cost (`AW`) without showing in their net pay.
 *
 * Why this translation exists instead of two checkboxes on screen: two independent controls offer a
 * fourth combination that means nothing and force crossing the flags in one's head to know which of
 * the three cases one is in. In the database the two columns remain —they are what the Excel brings
 * and what the parser reads—, so the conversion lives here, pure and tested, and not inside a
 * component.
 *
 * **The translation is ASYMMETRIC on purpose, and there is a real case.** `(FR=N, AC FR=S)` is «not
 * entitled» —`FR` leads, because both branches of §7 start by asking about it— and coming back from
 * that mode would give `(N, N)`. MORALES MENA SILVIA JIMENA brings exactly that combination in the
 * March 2026 rol. Nothing changes in the figures (with `FR=N` both branches give zero), but the screen
 * **must not rewrite the flags on opening a record**: only when someone changes the mode. Rewriting
 * them beforehand would be correcting a file nobody asked to have corrected.
 */
import type { PayrollEmployeeLine } from "./types";

export type ReserveFundMode = "sin-derecho" | "mensual" | "acumula";

/** The two columns of the book that define the mode — the minimal signature, so a stored record and a
 *  half-filled form are read alike. */
type ReserveFundFlags = Pick<PayrollEmployeeLine, "hasReserveFund" | "accumulatesReserveFund">;

/**
 * The three modes with the name the screen gives them. They live next to the type, and not in the
 * component, for the same reason `systemLabel` lives next to the ids of PyG's accounting systems: if
 * the list of modes and their labels were declared in different places, adding a mode would leave one
 * of the two un-updated.
 */
export const RESERVE_FUND_OPTIONS: readonly { value: ReserveFundMode; label: string }[] = [
  { value: "sin-derecho", label: "No le corresponde" },
  { value: "mensual", label: "Lo cobra cada mes" },
  { value: "acumula", label: "Lo acumula en el IESS" },
];

/** Which mode the stored flags describe. */
export function reserveFundMode(flags: ReserveFundFlags): ReserveFundMode {
  if (!flags.hasReserveFund) {
    return "sin-derecho";
  }
  return flags.accumulatesReserveFund ? "acumula" : "mensual";
}

/** The flags to store for a chosen mode. */
export function reserveFundFlags(mode: ReserveFundMode): ReserveFundFlags {
  return {
    hasReserveFund: mode !== "sin-derecho",
    accumulatesReserveFund: mode === "acumula",
  };
}
