/**
 * THE v2 → v3 MIGRATION: a rol row's label moves from the PERÍODO to the CAPTURE.
 *
 * It lives in its own file and not in `db.test.ts` because it needs to OPEN the database at the old
 * version, write in the old shape and close it before anybody imports `./db` — which is a singleton
 * that opens on import. Vitest isolates each file, so here that can be done.
 *
 * What is checked is the only thing that can go wrong: that no row and no amount is lost. Dexie does
 * not downgrade, so a migration that deletes too much has no way back.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

/** The database as v2 left it, with the declaration on the período and the amount on the record. */
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
    // A período that never declared anything: the migration cannot invent rows for it.
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
    // The case to watch out for: an employee WITHOUT a capture of a período that DID declare. The
    // screen showed them both rows at zero, so the migration has to give them to them.
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

    // With no previous capture, the rows arrive all the same and at zero: it is what the screen
    // showed.
    const luis = await db.employees.get("e2");
    expect(luis?.capture?.extras).toEqual([
      { id: "x1", label: "MOVILIZACION", kind: "aportable", amount: 0 },
      { id: "x2", label: "ALIMENTACION", kind: "noAportable", amount: 0 },
    ]);

    // A período that declared nothing invents rows for nobody.
    const zoe = await db.employees.get("e3");
    expect(zoe?.capture?.extras ?? []).toEqual([]);

    // And the período is left without the declaration, which is what makes nobody read it again.
    const marzo = await db.periods.get("p-marzo");
    expect(marzo).not.toHaveProperty("extraConcepts");
    expect(marzo?.year).toBe(2026);

    db.close();
  });
});
