import { daysBetween } from "./dates";
import type { Check } from "./types";

/** Operational reminders read all pending checks, including future issues and unassigned banks. */
export function pendingCollections(checks: readonly Check[], today: string) {
  return checks
    .filter((check) => !check.voided && check.step !== "cashed" && !check.cashedOn)
    .map((check) => {
      const days = check.expectedCashOn ? daysBetween(today, check.expectedCashOn) : null;
      const label =
        days === null
          ? "Falta programar el cobro"
          : days < 0
            ? `Pendiente hace ${-days} ${days === -1 ? "día" : "días"}`
            : days === 0
              ? "Cobro previsto hoy"
              : `Cobro en ${days} ${days === 1 ? "día" : "días"}`;
      const variant =
        days !== null && days < 0
          ? ("negative" as const)
          : days === null || days <= 7
            ? ("warning" as const)
            : ("outline" as const);
      return { check, days, label, variant };
    })
    .sort(
      (a, b) =>
        (a.days ?? Infinity) - (b.days ?? Infinity) || a.check.number.localeCompare(b.check.number),
    );
}
