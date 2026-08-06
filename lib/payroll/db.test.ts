import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyCapture } from "./employee-input";
import type { PayrollEmployeeLine } from "./types";
import {
  createClient,
  createPeriod,
  db,
  deleteClient,
  deletePeriod,
  describeClientContents,
  importRoster,
  getActiveClientId,
  getClient,
  listClients,
  listClientSummaries,
  listEmployees,
  listPeriods,
  periodFinancials,
  renameClient,
  updateEmployee,
  rosterCounts,
  setActiveClient,
} from "./db";

/** Cifras verbatim de una línea, con `paid` conciliado — la forma que produce el parser. */
const FIGURES = { gross: 620.5, deductions: 58.61, net: 561.89, cost: 712.3, paid: 561.89 };

/** The cliente every scoped case runs inside; a second one appears only where isolation is the point. */
let clientId = "";

/** Una ficha completa, para no repetir sus nueve campos en cada test de nómina. */
function employeeLine(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    periodId: overrides.periodId ?? "",
    name: "Ana Torres",
    role: "Recepcionista",
    area: "ADMINISTRACION",
    baseSalary: 460,
    contractType: "CT",
    idCard: "0102030405",
    hireDate: "2024-03-01",
    sectorCode: "S001",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    days: 12,
    ...overrides,
  };
}

beforeEach(async () => {
  await db.periods.clear();
  await db.clients.clear();
  await db.employees.clear();
  await db.active.clear();
  clientId = (await createClient("Manor Galápagos")).id;
});

describe("clientes", () => {
  it("creates an EMPTY cliente and opens it", async () => {
    expect(await listPeriods(clientId)).toEqual([]);
    expect(await getActiveClientId()).toBe(clientId);
  });

  it("lists clientes by name, and renaming reorders", async () => {
    await createClient("Ambato Centro");
    expect((await listClients()).map((c) => c.name)).toEqual(["Ambato Centro", "Manor Galápagos"]);

    await renameClient(clientId, "Alfa");
    expect((await listClients()).map((c) => c.name)).toEqual(["Alfa", "Ambato Centro"]);
  });

  it("renaming touches the label and nothing else", async () => {
    await createPeriod(clientId, 2026, 2);
    await renameClient(clientId, "Otro nombre");
    const summaries = await listClientSummaries();
    expect(summaries[0].name).toBe("Otro nombre");
    expect(summaries[0].periodCount).toBe(1);
  });

  it("summarizes what each cliente holds, for the selector's subline", async () => {
    await createPeriod(clientId, 2025, 0);
    await createPeriod(clientId, 2026, 2);
    await createPeriod(clientId, 2026, 5);

    const summary = (await listClientSummaries()).find((c) => c.id === clientId);
    expect(summary?.periodCount).toBe(3);
    expect(summary?.years).toEqual([2025, 2026]);
  });

  it("un cliente recién creado no tiene ningún período", async () => {
    const summary = (await listClientSummaries())[0];
    expect(summary.periodCount).toBe(0);
    expect(summary.years).toEqual([]);
  });

  it("counts what deleting a cliente discards", async () => {
    await createPeriod(clientId, 2025, 0);
    await createPeriod(clientId, 2026, 2);

    expect(await describeClientContents(clientId)).toEqual({
      periodCount: 2,
      years: [2025, 2026],
    });
  });
});

describe("aislamiento entre clientes", () => {
  let other = "";

  beforeEach(async () => {
    other = (await createClient("Ambato Centro")).id;
    await setActiveClient(clientId);
  });

  it("keeps the same (year, mes) of two clientes apart", async () => {
    await createPeriod(clientId, 2026, 5);
    await createPeriod(other, 2026, 5);

    expect((await listPeriods(clientId))[0].clientId).toBe(clientId);
    expect((await listPeriods(other))[0].clientId).toBe(other);
  });

  it("lists only the open cliente's períodos, so no read can mix two empresas", async () => {
    await createPeriod(clientId, 2026, 2);
    await createPeriod(other, 2026, 5);

    expect((await listPeriods(clientId)).map((p) => p.monthIndex)).toEqual([2]);
    expect((await listPeriods(other)).map((p) => p.monthIndex)).toEqual([5]);
  });

  it("deleting a cliente takes its períodos and leaves the others intact", async () => {
    await createPeriod(clientId, 2025, 0);
    await createPeriod(clientId, 2026, 2);
    await createPeriod(other, 2026, 5);

    await deleteClient(clientId);

    expect(await db.periods.where("clientId").equals(clientId).count()).toBe(0);
    expect((await listPeriods(other)).map((p) => p.monthIndex)).toEqual([5]);
    // The open cliente was deleted, so the module falls back to the first remaining one BY NAME.
    expect(await getActiveClientId()).toBe(other);
  });

  it("leaves no active cliente once the last one is deleted", async () => {
    await deleteClient(other);
    await deleteClient(clientId);
    expect(await getActiveClientId()).toBeNull();
    expect(await listClients()).toEqual([]);
  });

  it("deleting a cliente that is NOT active leaves the active one untouched", async () => {
    await deleteClient(other);
    expect(await getActiveClientId()).toBe(clientId);
    expect(await getClient(clientId)).toBeDefined();
  });
});

describe("períodos", () => {
  it("creates an empty período: captura, sin nómina cargada", async () => {
    const period = await createPeriod(clientId, 2026, 5);
    expect(period.status).toBe("captura");
    expect(period.clientId).toBe(clientId);
    expect((await periodFinancials([period.id])).has(period.id)).toBe(false);
  });

  it("lists períodos most-recent-first", async () => {
    await createPeriod(clientId, 2026, 2);
    await createPeriod(clientId, 2025, 11);
    await createPeriod(clientId, 2026, 5);

    expect((await listPeriods(clientId)).map((p) => [p.year, p.monthIndex])).toEqual([
      [2026, 5],
      [2026, 2],
      [2025, 11],
    ]);
  });

  it("rejects a duplicate (year, mes) for the same cliente", async () => {
    await createPeriod(clientId, 2026, 5);
    await expect(createPeriod(clientId, 2026, 5)).rejects.toThrow();
    expect(await listPeriods(clientId)).toHaveLength(1);
  });

  it("el mismo (year, mes) SÍ puede existir en dos clientes distintos", async () => {
    const other = (await createClient("Ambato Centro")).id;
    await createPeriod(clientId, 2026, 5);
    await expect(createPeriod(other, 2026, 5)).resolves.toBeDefined();
  });
});

describe("copiar nómina al crear un período", () => {
  it("con copyFrom, arrastra la ficha del período fuente y resetea `days`", async () => {
    const source = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: source.id, days: 12 }));

    const target = await createPeriod(clientId, 2026, 3, { copyFrom: source.id });
    const lines = await listEmployees(target.id);

    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Ana Torres");
    expect(lines[0].days).toBe(30);
    expect(lines[0].periodId).toBe(target.id);
    // The source's own nómina is untouched by the copy.
    expect((await listEmployees(source.id))[0].days).toBe(12);
  });

  it("copia varias líneas, cada una con un `id` propio", async () => {
    const source = await createPeriod(clientId, 2026, 2);
    await db.employees.bulkAdd([
      employeeLine({ periodId: source.id, name: "Ana Torres", area: "COCINA" }),
      employeeLine({ periodId: source.id, name: "Luis Vera", area: "VENTAS" }),
    ]);

    const target = await createPeriod(clientId, 2026, 3, { copyFrom: source.id });
    const lines = await listEmployees(target.id);

    expect(lines.map((l) => l.name).sort()).toEqual(["Ana Torres", "Luis Vera"]);
    expect(new Set(lines.map((l) => l.id)).size).toBe(2);
  });

  it("sin copyFrom, el período nuevo nace sin nómina", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    expect(await listEmployees(period.id)).toEqual([]);
  });

  it("copiar de una fuente sin nómina deja el destino también sin nómina", async () => {
    const source = await createPeriod(clientId, 2026, 2);
    const target = await createPeriod(clientId, 2026, 3, { copyFrom: source.id });
    expect(await listEmployees(target.id)).toEqual([]);
  });
});

describe("cascada de borrado sobre la nómina", () => {
  it("borrar un período borra su nómina", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: period.id }));

    await deletePeriod(period.id);

    expect(await listEmployees(period.id)).toEqual([]);
    expect(await listPeriods(clientId)).toEqual([]);
  });

  it("borrar un período no toca la nómina de otro", async () => {
    const doomed = await createPeriod(clientId, 2026, 2);
    const spared = await createPeriod(clientId, 2026, 3);
    await db.employees.add(employeeLine({ periodId: doomed.id }));
    await db.employees.add(employeeLine({ periodId: spared.id }));

    await deletePeriod(doomed.id);

    expect(await listEmployees(spared.id)).toHaveLength(1);
  });

  it("borrar un cliente borra la nómina de TODOS sus períodos", async () => {
    const p1 = await createPeriod(clientId, 2026, 2);
    const p2 = await createPeriod(clientId, 2026, 3);
    await db.employees.add(employeeLine({ periodId: p1.id }));
    await db.employees.add(employeeLine({ periodId: p2.id }));

    await deleteClient(clientId);

    expect(await db.employees.where("periodId").equals(p1.id).count()).toBe(0);
    expect(await db.employees.where("periodId").equals(p2.id).count()).toBe(0);
  });

  it("borrar un cliente no toca la nómina de otro cliente", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: period.id }));

    const other = (await createClient("Ambato Centro")).id;
    const otherPeriod = await createPeriod(other, 2026, 2);
    await db.employees.add(employeeLine({ periodId: otherPeriod.id }));

    await deleteClient(clientId);

    expect(await listEmployees(otherPeriod.id)).toHaveLength(1);
  });

  it("`describeClientContents` sigue contando períodos y años, sin verse afectado por la nómina", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: period.id }));

    expect(await describeClientContents(clientId)).toEqual({
      periodCount: 1,
      years: [2026],
    });
  });
});

describe("rosterCounts", () => {
  it("cuenta empleados y áreas distintas por período, en una sola consulta", async () => {
    const p1 = await createPeriod(clientId, 2026, 2);
    const p2 = await createPeriod(clientId, 2026, 3);
    await db.employees.bulkAdd([
      employeeLine({ periodId: p1.id, name: "Ana Torres", area: "COCINA" }),
      employeeLine({ periodId: p1.id, name: "Luis Vera", area: "VENTAS" }),
    ]);

    const counts = await rosterCounts([p1.id, p2.id]);

    expect(counts.get(p1.id)).toEqual({ employees: 2, areas: 2 });
    expect(counts.get(p2.id)).toEqual({ employees: 0, areas: 0 });
  });

  it("dos empleados de la misma área cuentan un área una sola vez", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.bulkAdd([
      employeeLine({ periodId: period.id, name: "Ana Torres", area: "COCINA" }),
      employeeLine({ periodId: period.id, name: "Luis Vera", area: "COCINA" }),
    ]);

    expect((await rosterCounts([period.id])).get(period.id)).toEqual({
      employees: 2,
      areas: 1,
    });
  });

  it("una lista vacía no consulta nada", async () => {
    expect(await rosterCounts([])).toEqual(new Map());
  });
});

describe("periodFinancials", () => {
  it("suma gross/deductions/net/cost SOLO de los empleados con figures, por período, en una sola consulta", async () => {
    const p1 = await createPeriod(clientId, 2026, 2);
    const p2 = await createPeriod(clientId, 2026, 3);
    await db.employees.bulkAdd([
      employeeLine({
        periodId: p1.id,
        name: "Ana Torres",
        figures: { gross: 500, deductions: 50, net: 450, cost: 600, paid: 450 },
      }),
      employeeLine({
        periodId: p1.id,
        name: "Luis Vera",
        figures: { gross: 300, deductions: 30, net: 270, cost: 360, paid: null },
      }),
      // sin figures: el período aún no recibió su archivo para este empleado.
      employeeLine({ periodId: p1.id, name: "Sin figuras" }),
    ]);

    const financials = await periodFinancials([p1.id, p2.id]);

    expect(financials.get(p1.id)).toEqual({ gross: 800, deductions: 80, net: 720, cost: 960 });
    expect(financials.has(p2.id)).toBe(false);
  });

  it("un período sin ningún empleado con figures no aparece en el mapa — no es cero, es «no hay»", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: period.id }));

    expect((await periodFinancials([period.id])).has(period.id)).toBe(false);
  });

  it("una lista vacía no consulta nada", async () => {
    expect(await periodFinancials([])).toEqual(new Map());
  });
});

describe("migración v1 → v2 (aditiva)", () => {
  it("una base v1 con clientes y períodos se abre sin perder nada, y ya admite nómina", async () => {
    db.close();
    await Dexie.delete("liderboard-payroll");

    const legacy = new Dexie("liderboard-payroll");
    legacy.version(1).stores({
      clients: "id",
      periods: "id, clientId, &[clientId+year+monthIndex]",
      active: "key",
    });
    await legacy.open();
    const legacyClientId = crypto.randomUUID();
    await legacy.table("clients").add({ id: legacyClientId, name: "Cliente viejo" });
    const legacyPeriodId = crypto.randomUUID();
    await legacy.table("periods").add({
      id: legacyPeriodId,
      clientId: legacyClientId,
      year: 2025,
      monthIndex: 0,
      kind: "ordinario",
      status: "captura",
    });
    await legacy.table("active").put({ key: "active", clientId: legacyClientId });
    legacy.close();

    await db.open();

    expect(await listClients()).toEqual([{ id: legacyClientId, name: "Cliente viejo" }]);
    expect((await listPeriods(legacyClientId)).map((p) => p.id)).toEqual([legacyPeriodId]);
    expect(await getActiveClientId()).toBe(legacyClientId);

    // La tabla nueva funciona de inmediato sobre datos viejos — nada especial "activa" la v2.
    await db.employees.add(employeeLine({ periodId: legacyPeriodId }));
    expect(await listEmployees(legacyPeriodId)).toHaveLength(1);

    // Re-siembra para que el resto de la suite (su `beforeEach` de arriba) siga desde un estado
    // conocido en vez de heredar lo que este test dejó.
    await db.clients.clear();
    await db.periods.clear();
    await db.employees.clear();
    await db.active.clear();
  });
});

describe("importRoster", () => {
  it("escribe la nómina que trajo el archivo, con `figures` intactas", async () => {
    const period = await createPeriod(clientId, 2026, 2);

    await importRoster(period.id, [
      { ...employeeLine({ name: "Silvia Morales" }), figures: FIGURES },
    ]);

    const stored = await listEmployees(period.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Silvia Morales");
    expect(stored[0].figures).toEqual(FIGURES);
    // El dueño se estampa en la puerta, no lo trae el archivo.
    expect(stored[0].periodId).toBe(period.id);
  });

  it("REEMPLAZA la nómina anterior en vez de fusionarla", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ name: "Quien ya no está" })]);

    await importRoster(period.id, [employeeLine({ name: "Silvia Morales" })]);

    // Fusionar dejaría viva a la baja del mes, sumando en los KPIs sin salir en ningún archivo.
    expect((await listEmployees(period.id)).map((line) => line.name)).toEqual(["Silvia Morales"]);
  });

  it("cargar dos veces el mismo archivo deja exactamente lo que declara, no el doble", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    const file = [
      employeeLine({ name: "Silvia Morales" }),
      employeeLine({ name: "Pedro Sandoval" }),
    ];

    await importRoster(period.id, file);
    await importRoster(period.id, file);

    expect(await listEmployees(period.id)).toHaveLength(2);
  });

  it("no toca la nómina de otro período", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    const abril = await createPeriod(clientId, 2026, 3);
    await importRoster(abril.id, [employeeLine({ name: "Nómina de abril" })]);

    await importRoster(marzo.id, [employeeLine({ name: "Nómina de marzo" })]);

    expect((await listEmployees(abril.id)).map((line) => line.name)).toEqual(["Nómina de abril"]);
  });

  it("una nómina vacía deja el período sin empleados, no falla", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine()]);

    await importRoster(period.id, []);

    expect(await listEmployees(period.id)).toEqual([]);
  });
});

describe("updateEmployee", () => {
  it("guarda la captura del mes y la deja legible tal cual", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ figures: FIGURES })]);
    const [stored] = await listEmployees(period.id);

    const capture = { ...emptyCapture(), overtimeHours50: 5.5, paid: 457.69 };
    await updateEmployee(stored.id, { capture });

    const [reloaded] = await listEmployees(period.id);
    expect(reloaded.capture).toEqual(capture);
  });

  it("guarda los campos de ficha que la pantalla edita", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ figures: FIGURES })]);
    const [stored] = await listEmployees(period.id);

    await updateEmployee(stored.id, { days: 15, baseSalary: 500 });

    const [reloaded] = await listEmployees(period.id);
    expect(reloaded.days).toBe(15);
    expect(reloaded.baseSalary).toBe(500);
  });

  it("no toca lo que no se le pasa", async () => {
    // Un parche parcial no puede borrar la ficha por omisión: la pantalla escribe un campo a la
    // vez, y `days` no debería llevarse por delante el nombre ni la captura.
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ figures: FIGURES })]);
    const [stored] = await listEmployees(period.id);
    await updateEmployee(stored.id, { capture: { ...emptyCapture(), bonus: 40 } });

    await updateEmployee(stored.id, { days: 20 });

    const [reloaded] = await listEmployees(period.id);
    expect(reloaded.days).toBe(20);
    expect(reloaded.name).toBe(stored.name);
    expect(reloaded.capture?.bonus).toBe(40);
    expect(reloaded.figures).toEqual(stored.figures);
  });

  it("un empleado que no existe no crea uno nuevo", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ figures: FIGURES })]);

    await updateEmployee("no-existe", { days: 99 });

    const lines = await listEmployees(period.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].days).not.toBe(99);
  });
});
