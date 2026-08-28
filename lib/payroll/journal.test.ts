import { describe, expect, it } from "vitest";
import {
  buildJournalEntry,
  JOURNAL_ACCOUNTS,
  movingJournalLines,
  type JournalAmounts,
} from "./journal";

/**
 * The MARCH 2026 entry exactly as `GENERAL!43-71` of the accountant's file writes it.
 *
 * It used to live in `lib/payroll/journal-mock.ts`, which fed the screen while the connection with
 * the período's figures did not exist; that file was deleted when it was wired up. The figures stay
 * HERE because they still serve what they are really worth: they are the only external evidence that
 * the catalogue adds up right, taken from a sheet that balances on its own (`C71 = D71 = 3,889.06`,
 * with its control cell `C73 = 0`). As a test fixture they cannot reach any screen.
 *
 * `seguro-privado` goes at zero: column `Q` did not move that month, which is exactly why the
 * imbalance that account corrects could not be seen here.
 */
const MARCH_2026: JournalAmounts = {
  "sueldos-administracion": 2918.58,
  "horas-extras-administracion": 0,
  "comisiones-administracion": 0,
  "decimo-tercer-sueldo-administracion": 243.21,
  "decimo-cuarto-sueldo-administracion": 241.02,
  "vacaciones-administracion": 131.63,
  "aporte-patronal-iess-administracion": 354.62,
  "fondo-reserva-iess-administracion": 0,
  viaticos: 0,
  "bono-nd": 0,
  "bonos-aportables": 0,
  "seguro-privado": 0,
  "licencias-permisos-tiempo-parcial": 0,
  "sueldos-por-pagar": 2862.76,
  "decimo-tercer-sueldo-por-pagar": 0,
  "decimo-cuarto-sueldo-por-pagar": 0,
  "vacaciones-por-pagar": 131.63,
  "anticipo-empleados": 200,
  "multas-empleados": 0,
  almuerzos: 0,
  "aportes-iess-por-pagar": 694.67,
  "prestamos-empresariales": 0,
  "impuesto-renta-empleados": 0,
  "consumo-locales-empleados": 0,
  "contribucion-solidaria": 0,
  "otros-descuentos": 0,
};

// The catalogue's exact order: 11 `debe` accounts first, then 14 `haber`.
const EXPECTED_ORDER = [
  "sueldos-administracion",
  "horas-extras-administracion",
  "comisiones-administracion",
  "decimo-tercer-sueldo-administracion",
  "decimo-cuarto-sueldo-administracion",
  "vacaciones-administracion",
  "aporte-patronal-iess-administracion",
  "fondo-reserva-iess-administracion",
  "viaticos",
  "bono-nd",
  "bonos-aportables",
  "seguro-privado",
  "licencias-permisos-tiempo-parcial",
  "sueldos-por-pagar",
  "decimo-tercer-sueldo-por-pagar",
  "decimo-cuarto-sueldo-por-pagar",
  "vacaciones-por-pagar",
  "anticipo-empleados",
  "multas-empleados",
  "almuerzos",
  "aportes-iess-por-pagar",
  "prestamos-empresariales",
  "impuesto-renta-empleados",
  "consumo-locales-empleados",
  "contribucion-solidaria",
  "otros-descuentos",
];

describe("JOURNAL_ACCOUNTS", () => {
  it("tiene 26 cuentas: 12 debe y 14 haber, en el orden del catálogo", () => {
    expect(JOURNAL_ACCOUNTS.map((account) => account.id)).toEqual(EXPECTED_ORDER);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "debe")).toHaveLength(12);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "haber")).toHaveLength(14);
  });

  it("no repite ningún id entre las 26 cuentas", () => {
    const ids = JOURNAL_ACCOUNTS.map((account) => account.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("las cuentas de sueldos y de licencias comparten code 621001 pero tienen id distinto", () => {
    // The pair sharing a code is no longer the IESS one (214001 disappeared from the catalogue): it is
    // the salary expense on the debit and the leave/permits/part-time on the credit, which in
    // GENERAL!44 are the same row of the book read through its two columns C and D.
    const sueldos621001 = JOURNAL_ACCOUNTS.filter((account) => account.code === "621001");
    expect(sueldos621001).toHaveLength(2);
    expect(sueldos621001[0].id).not.toBe(sueldos621001[1].id);
  });

  it("Viaticos, Bonos Aportables, Seguro Privado e Impuesto a la Renta no tienen código", () => {
    const sinCodigo = JOURNAL_ACCOUNTS.filter((account) => account.code === null).map((a) => a.id);
    expect(sinCodigo).toEqual([
      "viaticos",
      "bonos-aportables",
      "seguro-privado",
      "impuesto-renta-empleados",
    ]);
  });

  it("«Seguro Privado» es la cuenta añadida, en el debe y leyendo Q", () => {
    // The ONLY one that does not come from `GENERAL!43-71`. Without it the entry goes out of balance
    // by the private insurance amount — see `journal-amounts.test.ts`, which proves it over the engine.
    const cuenta = JOURNAL_ACCOUNTS.find((account) => account.id === "seguro-privado");
    expect(cuenta?.side).toBe("debe");
    expect(cuenta?.sourceColumns).toEqual(["Q"]);
  });

  it("las 26 cuentas declaran al menos una columna fuente", () => {
    for (const account of JOURNAL_ACCOUNTS) {
      expect(account.sourceColumns.length).toBeGreaterThan(0);
    }
  });
});

describe("el asiento de MARZO 2026 del archivo real", () => {
  it("cubre exactamente los id del catálogo", () => {
    // With Partial<Record<JournalAccountId, number>> the type already forbids a key outside the
    // catalogue; what this test covers is what the type cannot: that none is missing.
    expect(new Set(Object.keys(MARCH_2026))).toEqual(
      new Set(JOURNAL_ACCOUNTS.map((account) => account.id)),
    );
  });
});

describe("buildJournalEntry", () => {
  it("con marzo 2026, debe y haber cuadran en 3889.06", () => {
    const entry = buildJournalEntry(MARCH_2026);
    expect(entry.debit).toBeCloseTo(3889.06, 2);
    expect(entry.credit).toBeCloseTo(3889.06, 2);
    expect(entry.balanced).toBe(true);
  });

  it("el ruido de coma flotante no descuadra el asiento", () => {
    // 0.01 + 3889.05 gives 3889.0600000000004 in JS (checked in node, not assumed) — the same kind of
    // noise the real rol's own GENERAL!71 carries: its cell `D71` (SUM(D43:D70)) caches
    // 3889.0600000000004 while `C71` caches an exact 3889.06, and even so `C73 = C71-D71` gives 0
    // because Excel also compares to the cent. `sameToTheCentavo` is that same rule.
    const entry = buildJournalEntry({
      "sueldos-administracion": 0.01,
      "horas-extras-administracion": 3889.05,
      "sueldos-por-pagar": 3889.06,
    });
    expect(entry.debit).toBe(3889.0600000000004);
    expect(entry.credit).toBe(3889.06);
    expect(entry.balanced).toBe(true);
  });

  it("una diferencia real de un centavo sí descuadra el asiento", () => {
    const entry = buildJournalEntry({
      "sueldos-administracion": 100,
      "sueldos-por-pagar": 100.01,
    });
    expect(entry.balanced).toBe(false);
  });

  it("sin importes, las 26 filas quedan en null y los totales en 0", () => {
    const entry = buildJournalEntry({});
    expect(entry.lines).toHaveLength(26);
    expect(entry.lines.every((line) => line.amount === null)).toBe(true);
    expect(entry.debit).toBe(0);
    expect(entry.credit).toBe(0);
  });
});

describe("movingJournalLines", () => {
  it("sobre marzo 2026 deja 9 filas con movimiento", () => {
    const entry = buildJournalEntry(MARCH_2026);
    const moving = movingJournalLines(entry);
    expect(moving).toHaveLength(9);
    expect(entry.lines).toHaveLength(26);
  });

  it("no esconde una fila con amount null — no se sabe cuánto vale, no es cero", () => {
    const entry = buildJournalEntry({ "sueldos-administracion": 0 });
    const moving = movingJournalLines(entry);
    // The row set to an explicit 0 is hidden; the rest, at null, stay.
    expect(moving.some((line) => line.id === "sueldos-administracion")).toBe(false);
    expect(moving.some((line) => line.id === "viaticos" && line.amount === null)).toBe(true);
  });

  it("no altera debit ni credit del entry — solo filtra lines", () => {
    // The property that switching the «hide zeros» toggle on does not move the total shown above
    // depends on: movingJournalLines never touches the entry's numeric fields.
    const entry = buildJournalEntry(MARCH_2026);
    const debitBefore = entry.debit;
    const creditBefore = entry.credit;
    movingJournalLines(entry);
    expect(entry.debit).toBe(debitBefore);
    expect(entry.credit).toBe(creditBefore);
  });
});
