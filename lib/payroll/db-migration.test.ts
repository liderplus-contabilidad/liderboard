/**
 * LA MIGRACIÓN v2 → v3: el rótulo de una fila del rol se muda del PERÍODO a la CAPTURA.
 *
 * Vive en su propio archivo y no en `db.test.ts` porque necesita ABRIR la base en la versión vieja,
 * escribir con la forma vieja y cerrarla antes de que nadie importe `./db` — que es un singleton
 * que se abre al importarse. Vitest aísla cada archivo, así que aquí eso se puede hacer.
 *
 * Lo que se comprueba es lo único que puede salir mal: que ninguna fila y ningún importe se pierdan.
 * Dexie no baja de versión, así que una migración que borre de más no tiene vuelta atrás.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

/** La base tal como la dejaba la v2, con la declaración en el período y el importe en la ficha. */
async function seedV2(): Promise<void> {
  const old = new Dexie("liderboard-payroll");
  old.version(1).stores({
    clients: "id",
    periods: "id, clientId, &[clientId+year+monthIndex]",
    active: "key",
  });
  old.version(2).stores({ employees: "id, periodId" });
  await old.open();

  await old.table("clients").add({ id: "c1", name: "Delicmar" });
  await old.table("periods").bulkAdd([
    {
      id: "p-marzo",
      clientId: "c1",
      year: 2026,
      monthIndex: 2,
      kind: "ordinario",
      extraConcepts: [
        { id: "x1", label: "MOVILIZACION", kind: "aportable" },
        { id: "x2", label: "ALIMENTACION", kind: "noAportable" },
      ],
    },
    // Un período que nunca declaró nada: la migración no puede inventarle filas.
    { id: "p-abril", clientId: "c1", year: 2026, monthIndex: 3, kind: "ordinario" },
  ]);
  await old.table("employees").bulkAdd([
    {
      id: "e1",
      periodId: "p-marzo",
      name: "ANA",
      role: "",
      area: "COCINA",
      baseSalary: 500,
      contractType: "CT",
      idCard: "",
      hireDate: null,
      sectorCode: "",
      hasReserveFund: false,
      accumulatesReserveFund: false,
      days: 30,
      capture: { extraAmounts: { x1: 50, x2: 30 }, deductions: {} },
    },
    // El caso que hay que cuidar: un empleado SIN captura de un período que SÍ declaraba. La
    // pantalla le mostraba las dos filas en cero, así que la migración tiene que dárselas.
    {
      id: "e2",
      periodId: "p-marzo",
      name: "LUIS",
      role: "",
      area: "COCINA",
      baseSalary: 500,
      contractType: "CT",
      idCard: "",
      hireDate: null,
      sectorCode: "",
      hasReserveFund: false,
      accumulatesReserveFund: false,
      days: 30,
    },
    {
      id: "e3",
      periodId: "p-abril",
      name: "ZOE",
      role: "",
      area: "COCINA",
      baseSalary: 500,
      contractType: "CT",
      idCard: "",
      hireDate: null,
      sectorCode: "",
      hasReserveFund: false,
      accumulatesReserveFund: false,
      days: 30,
      capture: { deductions: {} },
    },
  ]);
  old.close();
}

describe("la migración v2 → v3", () => {
  it("muda las declaraciones del período a la captura de cada empleado, con su importe", async () => {
    await seedV2();
    const { db } = await import("./db");
    await db.open();

    const ana = await db.employees.get("e1");
    expect(ana?.capture?.extras).toEqual([
      { id: "x1", label: "MOVILIZACION", kind: "aportable", amount: 50 },
      { id: "x2", label: "ALIMENTACION", kind: "noAportable", amount: 30 },
    ]);
    expect(ana?.capture).not.toHaveProperty("extraAmounts");

    // Sin captura previa, las filas llegan igual y en cero: es lo que la pantalla enseñaba.
    const luis = await db.employees.get("e2");
    expect(luis?.capture?.extras).toEqual([
      { id: "x1", label: "MOVILIZACION", kind: "aportable", amount: 0 },
      { id: "x2", label: "ALIMENTACION", kind: "noAportable", amount: 0 },
    ]);

    // Un período que no declaraba nada no le inventa filas a nadie.
    const zoe = await db.employees.get("e3");
    expect(zoe?.capture?.extras ?? []).toEqual([]);

    // Y el período se queda sin la declaración, que es lo que hace que nadie vuelva a leerla.
    const marzo = await db.periods.get("p-marzo");
    expect(marzo).not.toHaveProperty("extraConcepts");
    expect(marzo?.year).toBe(2026);

    db.close();
  });
});
