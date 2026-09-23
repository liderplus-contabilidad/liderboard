import { addDays, daysBetween, isISODate } from "./dates";
import type { BankAccount } from "./types";

type Dates = Pick<BankAccount, "overdraftStartsOn" | "overdraftEndsOn">;

export function overdraftDatesError(dates: Dates): string | undefined {
  for (const date of [dates.overdraftStartsOn, dates.overdraftEndsOn]) {
    if (date != null && (!isISODate(date) || addDays(date, 0) !== date)) {
      return "Selecciona una fecha válida.";
    }
  }
  if (
    dates.overdraftStartsOn &&
    dates.overdraftEndsOn &&
    dates.overdraftStartsOn > dates.overdraftEndsOn
  ) {
    return "La fecha de fin debe ser igual o posterior a la fecha de inicio.";
  }
}

/** Reminders use today's civil date, independently of the selected historical cut. */
export function overdraftNotice(account: Pick<BankAccount, "overdraft"> & Dates, today: string) {
  if (account.overdraft <= 0 || overdraftDatesError(account)) return null;
  if (account.overdraftStartsOn && account.overdraftStartsOn > today) {
    const days = daysBetween(today, account.overdraftStartsOn);
    return {
      label: `Inicia en ${days} ${days === 1 ? "día" : "días"}`,
      variant: "outline" as const,
    };
  }
  if (!account.overdraftEndsOn) return null;
  const days = daysBetween(today, account.overdraftEndsOn);
  if (days < 0)
    return {
      label: `Vencido hace ${-days} ${days === -1 ? "día" : "días"}`,
      variant: "negative" as const,
    };
  if (days === 0) return { label: "Vence hoy", variant: "warning" as const };
  return {
    label: `Vence en ${days} ${days === 1 ? "día" : "días"}`,
    variant: days <= 7 ? ("warning" as const) : ("outline" as const),
  };
}
