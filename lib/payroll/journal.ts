/**
 * The período's JOURNAL ENTRY: the fixed catalogue of accounts the rol de pagos generates each month
 * (taken from rows `GENERAL!43-71` of the accountant's Excel — the version that BALANCES, not the one
 * on the `ASIENTOS` sheet) and the pure derivations over it. The amounts arrive by parameter; what
 * produces them is `journal-amounts.ts`, summing the período's whole nómina through the engine.
 *
 * There are **26** accounts: the book's 24 and two this app adds —`seguro-privado`, without which the
 * entry goes out of balance by `Q`'s amount, and `bonos-aportables`, without which it goes out of
 * balance by the contributory extra income concepts a período declares—. The why, with the algebra, is
 * in each one's entry; both are pending confirmation with the firm.
 *
 * Two of its `sourceColumns` are NOT columns of the book but pseudo-columns (`EXTRA_AP`, `EXTRA_NA`):
 * the extra concepts have no place on the `GENERAL` sheet, and giving them the name of a column that
 * does exist would make the accountant believe they can check them against it.
 *
 * Why an account's key is `id` and not `code`: `621001` appears TWICE in the catalogue (the salary
 * expense on the `debe`, `GENERAL!C44`, and on the `haber` the leave/permits/part-time,
 * `GENERAL!D44` — the book puts them on the same row, one in each column) and two more accounts carry
 * no code at all (`Viaticos`, `Impuesto a la Renta Empleados`). If the key were `code`, the two
 * `621001` rows would collapse into one and the two with no code would be left with no key at all.
 * `code: null` means «the accountant's chart assigned it no code» — not «still to be filled in», and
 * it must not be filled with an invented one.
 *
 * `sourceColumns` declares which rol columns make up each account, and **it is what the entry
 * executes**: `journal-amounts.ts` WALKS it to sum. It is not documentation next to the code —that is
 * what it was while the connection did not exist—, and that is the reason it is still a datum of the
 * catalogue: a second list of sums written by hand per account could drift from this annotation with
 * nothing giving it away, and then the catalogue would say one thing while the entry does another. By
 * walking it, the only way to get it wrong is to get it wrong here, which is what the accountant can
 * review against their sheet.
 */
import { sameToTheCentavo } from "./amounts";

export type JournalSide = "debe" | "haber";

export interface JournalAccount {
  id: string;
  code: string | null;
  name: string;
  side: JournalSide;
  sourceColumns: readonly string[];
}

/**
 * The entry's 24 accounts, in the order `GENERAL!43-71` lists them: first the `debe` (10 administrative
 * expense accounts), then the `haber` (14 payable/withholding accounts). The `name`s go VERBATIM,
 * typos included («Anticpo Empleados», «Vacaciones Pagar») — they are the labels the accountant checks
 * the screen against their sheet with, and correcting them breaks that check while gaining nothing.
 *
 * `as const satisfies readonly JournalAccount[]` checks the shape without widening the literals: were
 * the constant annotated as `: readonly JournalAccount[]`, every `id` would become `string` and
 * `JournalAccountId` (below) could not be narrowed to the 24 real keys.
 */
export const JOURNAL_ACCOUNTS = [
  // --- Debe: 10 administrative expense accounts (GENERAL!44-53) ---
  {
    id: "sueldos-administracion",
    code: "621001",
    name: "Sueldos Administracion",
    side: "debe",
    sourceColumns: ["F"],
  },
  {
    id: "horas-extras-administracion",
    code: "621002",
    name: "Horas Extras Administracion",
    side: "debe",
    sourceColumns: ["M"],
  },
  {
    id: "comisiones-administracion",
    code: "621003",
    name: "Comisiones Administracion",
    side: "debe",
    // `ASIENTOS`' one sums Q+R+S+T; the corrected one only S+T — Q and R are other columns of the rol.
    sourceColumns: ["S", "T"],
  },
  {
    id: "decimo-tercer-sueldo-administracion",
    code: "621004",
    name: "Decimo 3er Sueldo Administr.",
    side: "debe",
    sourceColumns: ["AS", "O"],
  },
  {
    id: "decimo-cuarto-sueldo-administracion",
    code: "621005",
    name: "Decimo 4to Sueldo Administr.",
    side: "debe",
    sourceColumns: ["AT", "N"],
  },
  {
    id: "vacaciones-administracion",
    code: "621006",
    name: "Vacaciones Administracion",
    side: "debe",
    sourceColumns: ["AV", "P"],
  },
  {
    id: "aporte-patronal-iess-administracion",
    code: "621007",
    name: "Aporte patronal IESS Administr.",
    side: "debe",
    sourceColumns: ["AU"],
  },
  {
    id: "fondo-reserva-iess-administracion",
    code: "621008",
    name: "Fondo Reserva IESS Administr.",
    side: "debe",
    sourceColumns: ["AW", "U"],
  },
  {
    id: "viaticos",
    code: null,
    name: "Viaticos",
    side: "debe",
    // `ASIENTOS`' one reads `V` (the Bono ND column, below); the corrected one reads `R`.
    sourceColumns: ["R"],
  },
  {
    id: "bono-nd",
    // `GENERAL!A53` literally carries `6`, not a `6210xx` code. It goes verbatim: inventing a code
    // would be guessing, and setting it to `null` would erase the evidence that there is something
    // there to ask the accountant about.
    code: "6",
    name: "Bono ND",
    side: "debe",
    // `EXTRA_NA` is the NON-CONTRIBUTORY extra concepts a período declares. They go here and not to an
    // account of their own because this account IS exactly that: the destination of the bonus that
    // does not contribute. Adding them to it tells the truth instead of opening a second account for
    // the same thing.
    sourceColumns: ["V", "EXTRA_NA"],
  },
  {
    id: "bonos-aportables",
    code: null,
    name: "Bonos Aportables",
    side: "debe",
    // ⚠ The SECOND account that does not come from `GENERAL!43-71`, by the same algebra as
    // `seguro-privado` (below): a CONTRIBUTORY extra concept enters `W` and reaches the employee
    // through the credit inside `AP`, so with no destination on the debit the entry would go out of
    // balance by its amount. Its effects on `X`, `AU`, `AS`, `AV` and `AW` are picked up by the
    // accounts that already read those columns, so this one only has to cover the income itself.
    //
    // With no code, the same treatment as `Viaticos` and `Seguro Privado`. **Pending confirmation with
    // the firm**: if they prefer to spread it across existing accounts —`Comisiones Administracion`,
    // or one per concept— this entry and its row of `journal-amounts.ts`'s map get changed.
    sourceColumns: ["EXTRA_AP"],
  },
  {
    id: "seguro-privado",
    code: null,
    name: "Seguro Privado",
    side: "debe",
    // ⚠ The ONLY account of the catalogue that does NOT come from `GENERAL!43-71`. This app adds it,
    // and it exists because without it the entry GOES OUT OF BALANCE by the private insurance amount:
    //
    //   Debit  = F+M+S+T+AS+O+AT+N+AV+P+AU+AW+U+R+V  = (W − Q) + AS+AT+AV+AU+AW
    //   Credit = (Z+AN+AI)+AP+AS+AT+AV+AA+AE+AD
    //          + (X+AU+Y+AW)+AB+AC+AF+AG+AH           =  W      + AS+AT+AV+AU+AW
    //
    // `Q` enters `W` (the income), reaches the employee through the credit inside `AP` (the net pay),
    // and none of the book's 24 accounts picks it up on the debit: Credit − Debit = Q. In the real
    // March file `Q` is zero, and that is why the imbalance cannot be seen there.
    //
    // It goes to the DEBIT because that is what the column means —the company pays an insurance as a
    // benefit: it is an EXPENSE that reaches the employee's net pay— and because it is where the
    // algebra says it is missing. With no code, the same treatment as `Viaticos`: the accountant's
    // chart did not assign it one either.
    //
    // **Pending confirmation with the firm.** If they prefer another destination for `Q`, this entry
    // and its row of `journal-amounts.ts`'s map get changed; nothing else depends on it.
    sourceColumns: ["Q"],
  },
  // --- Haber: 14 payable/withholding accounts (GENERAL!44,54-60,63,66-70) ---
  {
    id: "licencias-permisos-tiempo-parcial",
    code: "621001",
    // With no name of its own on the sheet: this credit (`GENERAL!D44 = Z39+AN39+AI39`) shares a row
    // with `621001`'s debit above, so the name column is already occupied by «Sueldos
    // Administracion». The three columns that make it up: `Z` (LICENCIA SIN SUELDO), `AN` (Descuento
    // PERMISO MEDICO) and `AI` (DESCUENTO TIEMPO PACIAL). It is what makes the entry balance when a
    // part-time employee comes in — `ASIENTOS`' version gave them no destination and that is why it
    // went out of balance.
    name: "Licencias, permisos y tiempo parcial",
    side: "haber",
    sourceColumns: ["Z", "AN", "AI"],
  },
  {
    id: "sueldos-por-pagar",
    code: "213001",
    name: "Sueldos por Pagar",
    side: "haber",
    sourceColumns: ["AP"],
  },
  {
    id: "decimo-tercer-sueldo-por-pagar",
    code: "213003",
    name: "Decimo Tercer Sueldo por Pagar",
    side: "haber",
    sourceColumns: ["AS"],
  },
  {
    id: "decimo-cuarto-sueldo-por-pagar",
    code: "213004",
    name: "Decimo Cuarto Sueldo por Pagar",
    side: "haber",
    sourceColumns: ["AT"],
  },
  {
    id: "vacaciones-por-pagar",
    code: "213005",
    name: "Vacaciones Pagar",
    side: "haber",
    sourceColumns: ["AV"],
  },
  {
    id: "anticipo-empleados",
    code: "1.1.2.8.1",
    name: "Anticpo Empleados",
    side: "haber",
    sourceColumns: ["AA"],
  },
  {
    id: "multas-empleados",
    code: "213009",
    name: "Multas Empleados",
    side: "haber",
    sourceColumns: ["AE"],
  },
  {
    id: "almuerzos",
    code: "218003",
    name: "Almuerzos",
    side: "haber",
    sourceColumns: ["AD"],
  },
  {
    id: "aportes-iess-por-pagar",
    code: "2.1.7.1.9",
    // Fuses into one single account the FOUR the sheet cancels right below (`GENERAL!61,62,64,65`:
    // two IESS contributions 214001 at 9.45% and at 12.15%, `214002 Prestamos IESS por Pagar` and
    // `214003 Fondo Reserva IESS por Pagar`), each with its formula multiplied by zero. They do not
    // enter the catalogue — they would be four rows that can never carry a figure, and `214002` would
    // clash by code with «Prestamos Empresariales» below, which is alive. `GENERAL!E61 = SUM(D61:D65)`
    // confirms this account is worth exactly what the four together are: X + AU + Y + AW.
    name: "Aportes IESS por Pagar",
    side: "haber",
    sourceColumns: ["X", "AU", "Y", "AW"],
  },
  {
    id: "prestamos-empresariales",
    code: "214002",
    name: "Prestamos Empresariales",
    side: "haber",
    sourceColumns: ["AB"],
  },
  {
    id: "impuesto-renta-empleados",
    code: null,
    name: "Impuesto a la Renta Empleados",
    side: "haber",
    sourceColumns: ["AC"],
  },
  {
    id: "consumo-locales-empleados",
    code: "2.1.7.7.6",
    name: "Consumo en Locales / Empleados",
    side: "haber",
    sourceColumns: ["AF"],
  },
  {
    id: "contribucion-solidaria",
    code: "218006",
    name: "Contribución Solidaria",
    side: "haber",
    sourceColumns: ["AG"],
  },
  {
    id: "otros-descuentos",
    code: "218007",
    name: "Otros Descuentos",
    side: "haber",
    sourceColumns: ["AH"],
  },
] as const satisfies readonly JournalAccount[];

/**
 * The 24 valid amount keys, derived from the catalogue itself — never declared separately by hand,
 * because a second list falls out of sync as soon as the catalogue changes.
 */
export type JournalAccountId = (typeof JOURNAL_ACCOUNTS)[number]["id"];

/**
 * An `id` mistyped by whoever wires the real figures must fail at COMPILE time, not on screen: with
 * `Record<string, number>` any key got through, the corresponding row stayed `null` forever and the
 * card said «Descuadra» without pointing at why. `Partial` because a month may bring no figure for
 * some account (that is how `buildJournalEntry` models it, further below, treating absence as «it is
 * not known», not as zero).
 */
export type JournalAmounts = Partial<Record<JournalAccountId, number>>;

export interface JournalLine extends JournalAccount {
  amount: number | null;
}

export interface JournalEntry {
  lines: readonly JournalLine[];
  debit: number;
  credit: number;
  balanced: boolean;
}

/**
 * Assembles the complete entry by walking `JOURNAL_ACCOUNTS` in order. An amount absent from `amounts`
 * is `null` — not zero: the same distinction `PayrollEmployeeFigures` already makes for a período that
 * did not receive its file. Not saying «zero» to what is really «not known» keeps a row with no datum
 * from reading as an account that really had no movement.
 */
export function buildJournalEntry(amounts: JournalAmounts): JournalEntry {
  const lines: JournalLine[] = JOURNAL_ACCOUNTS.map((account) => ({
    ...account,
    // `?? null` instead of the earlier `Object.hasOwn`: with `JournalAmounts` already typed by
    // `JournalAccountId`, an `undefined` can only come from an absent key (never from an
    // absent-but-still-present one), so the semantics are the same and this form does not let through
    // an `undefined` that would paint `NaN` if some future round relaxed the type.
    amount: amounts[account.id] ?? null,
  }));

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    // For the SUM an absent amount does count as 0 — it is the entry's total as far as it is known,
    // not a claim that the accounts with no datum are worth zero.
    const amount = line.amount ?? 0;
    if (line.side === "debe") {
      debit += amount;
    } else {
      credit += amount;
    }
  }

  return { lines, debit, credit, balanced: sameToTheCentavo(debit, credit) };
}

/**
 * The entry's rows «with movement»: the ones the user needs to see. A row at exactly `0` is hidden
 * because it adds nothing to the reading; a row at `null` stays —how much it is worth is not known
 * yet, and hiding it would be claiming it is zero when it is not. It filters `lines`, it never touches
 * `debit`/`credit`: switching the toggle on or off cannot move the total the user already saw above.
 */
export function movingJournalLines(entry: JournalEntry): readonly JournalLine[] {
  return entry.lines.filter((line) => line.amount !== 0);
}
