import { describe, expect, it } from "vitest";
import { buildJournalEntry, JOURNAL_ACCOUNTS, movingJournalLines } from "./journal";
import { JOURNAL_MOCK_AMOUNTS } from "./journal-mock";

// El orden exacto del catálogo especificado en
// openspec/changes/payroll-journal-entry/specs/payroll-journal-entry/spec.md: 10 cuentas `debe`
// primero, luego 14 `haber`.
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
  it("tiene 24 cuentas: 10 debe y 14 haber, en el orden del catálogo", () => {
    expect(JOURNAL_ACCOUNTS.map((account) => account.id)).toEqual(EXPECTED_ORDER);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "debe")).toHaveLength(10);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "haber")).toHaveLength(14);
  });

  it("no repite ningún id entre las 24 cuentas", () => {
    const ids = JOURNAL_ACCOUNTS.map((account) => account.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("las cuentas de sueldos y de licencias comparten code 621001 pero tienen id distinto", () => {
    // La pareja que comparte código ya no es la de IESS (214001 desapareció del catálogo): es el
    // gasto de sueldos del debe y las licencias/permisos/tiempo parcial del haber, que en
    // GENERAL!44 son la misma fila del libro leída por sus dos columnas C y D.
    const sueldos621001 = JOURNAL_ACCOUNTS.filter((account) => account.code === "621001");
    expect(sueldos621001).toHaveLength(2);
    expect(sueldos621001[0].id).not.toBe(sueldos621001[1].id);
  });

  it("Viaticos e Impuesto a la Renta Empleados no tienen código de cuenta", () => {
    const viaticos = JOURNAL_ACCOUNTS.find((account) => account.id === "viaticos");
    const incomeTax = JOURNAL_ACCOUNTS.find((account) => account.id === "impuesto-renta-empleados");
    expect(viaticos?.code).toBeNull();
    expect(incomeTax?.code).toBeNull();
  });

  it("las 24 cuentas declaran al menos una columna fuente", () => {
    for (const account of JOURNAL_ACCOUNTS) {
      expect(account.sourceColumns.length).toBeGreaterThan(0);
    }
  });
});

describe("JOURNAL_MOCK_AMOUNTS", () => {
  it("sus claves son exactamente el conjunto de id del catálogo", () => {
    // Con Partial<Record<JournalAccountId, number>> el tipo ya impide una clave ajena al
    // catálogo; lo que este test cubre es lo que el tipo no puede: que no falte ninguna de las
    // 24 y que no sobre ninguna que el catálogo ya no tenga.
    const mockKeys = new Set(Object.keys(JOURNAL_MOCK_AMOUNTS));
    const catalogIds = new Set(JOURNAL_ACCOUNTS.map((account) => account.id));
    expect(mockKeys).toEqual(catalogIds);
  });
});

describe("buildJournalEntry", () => {
  it("con la muestra de marzo 2026, debe y haber cuadran en 3889.06", () => {
    const entry = buildJournalEntry(JOURNAL_MOCK_AMOUNTS);
    expect(entry.debit).toBeCloseTo(3889.06, 2);
    expect(entry.credit).toBeCloseTo(3889.06, 2);
    expect(entry.balanced).toBe(true);
  });

  it("el ruido de coma flotante no descuadra el asiento", () => {
    // 0.01 + 3889.05 da 3889.0600000000004 en JS (comprobado en node, no asumido) — el mismo tipo
    // de ruido que trae el propio GENERAL!71 del rol real: su celda `D71` (SUM(D43:D70)) cachea
    // 3889.0600000000004 mientras `C71` cachea 3889.06 exacto, y aun así `C73 = C71-D71` da 0
    // porque Excel también compara al centavo. `sameToTheCentavo` es esa misma regla.
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

  it("sin importes, las 24 filas quedan en null y los totales en 0", () => {
    const entry = buildJournalEntry({});
    expect(entry.lines).toHaveLength(24);
    expect(entry.lines.every((line) => line.amount === null)).toBe(true);
    expect(entry.debit).toBe(0);
    expect(entry.credit).toBe(0);
  });
});

describe("movingJournalLines", () => {
  it("sobre la muestra de marzo 2026 deja 9 filas y esconde 15", () => {
    const entry = buildJournalEntry(JOURNAL_MOCK_AMOUNTS);
    const moving = movingJournalLines(entry);
    expect(moving).toHaveLength(9);
    expect(entry.lines).toHaveLength(24);
  });

  it("no esconde una fila con amount null — no se sabe cuánto vale, no es cero", () => {
    const entry = buildJournalEntry({ "sueldos-administracion": 0 });
    const moving = movingJournalLines(entry);
    // La fila puesta en 0 explícito se esconde; el resto, en null, se queda.
    expect(moving.some((line) => line.id === "sueldos-administracion")).toBe(false);
    expect(moving.some((line) => line.id === "viaticos" && line.amount === null)).toBe(true);
  });

  it("no altera debit ni credit del entry — solo filtra lines", () => {
    // La propiedad de la que depende que encender el interruptor «ocultar en cero» no mueva el
    // total mostrado arriba: movingJournalLines nunca toca los campos numéricos del entry.
    const entry = buildJournalEntry(JOURNAL_MOCK_AMOUNTS);
    const debitBefore = entry.debit;
    const creditBefore = entry.credit;
    movingJournalLines(entry);
    expect(entry.debit).toBe(debitBefore);
    expect(entry.credit).toBe(creditBefore);
  });
});
