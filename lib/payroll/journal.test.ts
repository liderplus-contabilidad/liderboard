import { describe, expect, it } from "vitest";
import {
  buildJournalEntry,
  JOURNAL_ACCOUNTS,
  movingJournalLines,
  type JournalAmounts,
} from "./journal";

/**
 * El asiento de MARZO 2026 tal como lo escribe `GENERAL!43-71` del archivo del contador.
 *
 * Vivía en `lib/payroll/journal-mock.ts`, que alimentaba la pantalla mientras la conexión con las
 * cifras del período no existía; ese archivo se borró al cablearla. Las cifras se quedan AQUÍ
 * porque siguen sirviendo para lo que de verdad valen: son la única evidencia externa de que el
 * catálogo suma bien, tomada de una hoja que cuadra sola (`C71 = D71 = 3,889.06`, con su celda de
 * control `C73 = 0`). Como fixture de test no pueden llegar a ninguna pantalla.
 *
 * `seguro-privado` va en cero: la columna `Q` no se movió ese mes, que es exactamente la razón por
 * la que el descuadre que esa cuenta corrige no se veía aquí.
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

// El orden exacto del catálogo: 11 cuentas `debe` primero, luego 14 `haber`.
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
  it("tiene 25 cuentas: 11 debe y 14 haber, en el orden del catálogo", () => {
    expect(JOURNAL_ACCOUNTS.map((account) => account.id)).toEqual(EXPECTED_ORDER);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "debe")).toHaveLength(11);
    expect(JOURNAL_ACCOUNTS.filter((account) => account.side === "haber")).toHaveLength(14);
  });

  it("no repite ningún id entre las 25 cuentas", () => {
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

  it("Viaticos, Seguro Privado e Impuesto a la Renta no tienen código de cuenta", () => {
    const sinCodigo = JOURNAL_ACCOUNTS.filter((account) => account.code === null).map((a) => a.id);
    expect(sinCodigo).toEqual(["viaticos", "seguro-privado", "impuesto-renta-empleados"]);
  });

  it("«Seguro Privado» es la cuenta añadida, en el debe y leyendo Q", () => {
    // La ÚNICA que no sale de `GENERAL!43-71`. Sin ella el asiento descuadra por el importe del
    // seguro privado — ver `journal-amounts.test.ts`, que lo prueba sobre el motor.
    const cuenta = JOURNAL_ACCOUNTS.find((account) => account.id === "seguro-privado");
    expect(cuenta?.side).toBe("debe");
    expect(cuenta?.sourceColumns).toEqual(["Q"]);
  });

  it("las 25 cuentas declaran al menos una columna fuente", () => {
    for (const account of JOURNAL_ACCOUNTS) {
      expect(account.sourceColumns.length).toBeGreaterThan(0);
    }
  });
});

describe("el asiento de MARZO 2026 del archivo real", () => {
  it("cubre exactamente los id del catálogo", () => {
    // Con Partial<Record<JournalAccountId, number>> el tipo ya impide una clave ajena al catálogo;
    // lo que este test cubre es lo que el tipo no puede: que no falte ninguna.
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

  it("sin importes, las 25 filas quedan en null y los totales en 0", () => {
    const entry = buildJournalEntry({});
    expect(entry.lines).toHaveLength(25);
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
    expect(entry.lines).toHaveLength(25);
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
    const entry = buildJournalEntry(MARCH_2026);
    const debitBefore = entry.debit;
    const creditBefore = entry.credit;
    movingJournalLines(entry);
    expect(entry.debit).toBe(debitBefore);
    expect(entry.credit).toBe(creditBefore);
  });
});
