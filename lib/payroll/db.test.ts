import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { computeLinePayroll, emptyCapture } from "./employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import { computePeriodFinancials } from "./period-detail";
import type { PayrollEmployeeLine } from "./types";
import {
  addEmployee,
  deleteEmployee,
  createClient,
  createPeriod,
  db,
  deleteClient,
  deletePeriod,
  describeClientContents,
  employeesForPeriods,
  importRoster,
  getActiveClientId,
  getClient,
  listClients,
  listClientSummaries,
  listEmployees,
  listPeriods,
  periodFinancials,
  updateClient,
  updateEmployee,
  rosterCounts,
  setActiveClient,
} from "./db";

/** The cliente every scoped case runs inside; a second one appears only where isolation is the point. */
let clientId = "";

/** Un perfil de empresa completo, el del archivo real del cliente. */
const COMPANY = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
  email: "nomina@delicmar.com",
};

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
    provisionsThirteenth: false,
    provisionsFourteenth: false,
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

    await updateClient(clientId, "Alfa", null);
    expect((await listClients()).map((c) => c.name)).toEqual(["Alfa", "Ambato Centro"]);
  });

  it("renaming touches the label and nothing else", async () => {
    await createPeriod(clientId, 2026, 2);
    await updateClient(clientId, "Otro nombre", null);
    const summaries = await listClientSummaries();
    expect(summaries[0].name).toBe("Otro nombre");
    expect(summaries[0].periodCount).toBe(1);
  });

  it("stores the logo, and removing it deletes the field rather than storing an empty one", async () => {
    const logo = {
      dataUrl: "data:image/png;base64,SGk=",
      mime: "image/png" as const,
      width: 8,
      height: 4,
    };
    const withLogo = await createClient("Con logo", logo);
    expect((await getClient(withLogo.id))?.logo).toEqual(logo);

    // Lo que se comprueba aquí es el comportamiento de Dexie del que depende «Quitar»: un
    // `undefined` en un `update` BORRA la propiedad. Si en su lugar la dejara puesta, las tres
    // superficies dibujarían un logo vacío en vez de ninguno.
    await updateClient(withLogo.id, "Con logo", null);
    const cleared = await getClient(withLogo.id);
    expect(cleared?.logo).toBeUndefined();
    expect("logo" in (cleared ?? {})).toBe(false);
  });

  it("a cliente created with no logo stores no empty field either", async () => {
    expect("logo" in ((await getClient(clientId)) ?? {})).toBe(false);
  });

  it("guarda el perfil de empresa y lo edita sin tocar los períodos", async () => {
    const conPerfil = await createClient("Delicmar", undefined, COMPANY);
    expect((await getClient(conPerfil.id))?.company).toEqual(COMPANY);

    await createPeriod(conPerfil.id, 2026, 2);
    await updateClient(conPerfil.id, "Delicmar", null, {
      ...COMPANY,
      address: "OTRA CALLE",
    });

    expect((await getClient(conPerfil.id))?.company?.address).toBe("OTRA CALLE");
    expect((await listPeriods(conPerfil.id)).length).toBe(1);
  });

  // Un cliente guardado antes de que el perfil existiera es el caso normal, no el raro: la app
  // tiene que leerlo sin error y el membrete imprimir lo que haya.
  it("un cliente sin perfil no guarda un campo vacío y se lee igual", async () => {
    const client = await getClient(clientId);
    expect(client?.company).toBeUndefined();
    expect("company" in (client ?? {})).toBe(false);
  });

  // Renombrar desde un módulo que no pide perfil (PyG, Ocupaciones) NO puede borrar el que hay:
  // `undefined` significa «esta llamada no habla del perfil», no «quítalo».
  it("renombrar sin hablar del perfil lo conserva", async () => {
    const conPerfil = await createClient("Delicmar", undefined, COMPANY);
    await updateClient(conPerfil.id, "Delicmar S.A.S.", null);
    expect((await getClient(conPerfil.id))?.company).toEqual(COMPANY);
  });

  it("guarda el centro de costo, y vaciarlo BORRA el campo en vez de dejarlo a medias", async () => {
    const center = {
      name: "Planta Ambato",
      logo: {
        dataUrl: "data:image/png;base64,Q0M=",
        mime: "image/png" as const,
        width: 8,
        height: 4,
      },
    };
    const conCentro = await createClient("Delicmar", undefined, COMPANY, center);
    expect((await getClient(conCentro.id))?.costCenter).toEqual(center);

    // Vaciar el nombre en el diálogo llega aquí como `null`, y es la única forma de quitarlo: un
    // `{ name: "" }` guardado dejaría un rótulo «Delicmar · » en los tres papeles.
    await updateClient(conCentro.id, "Delicmar", null, COMPANY, null);
    const cleared = await getClient(conCentro.id);
    expect(cleared?.costCenter).toBeUndefined();
    expect("costCenter" in (cleared ?? {})).toBe(false);
  });

  // El mismo contrato que el perfil: `undefined` es «esta llamada no habla del centro».
  it("renombrar sin hablar del centro lo conserva", async () => {
    const center = { name: "Planta Ambato" };
    const conCentro = await createClient("Delicmar", undefined, undefined, center);
    await updateClient(conCentro.id, "Delicmar S.A.S.", null);
    expect((await getClient(conCentro.id))?.costCenter).toEqual(center);
  });

  it("un cliente sin centro no guarda un campo vacío", async () => {
    expect("costCenter" in ((await getClient(clientId)) ?? {})).toBe(false);
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
  it("creates an empty período: sin nómina cargada", async () => {
    const period = await createPeriod(clientId, 2026, 5);
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

describe("employeesForPeriods", () => {
  it("devuelve la nómina de cada período, en una sola consulta", async () => {
    const p1 = await createPeriod(clientId, 2026, 2);
    const p2 = await createPeriod(clientId, 2026, 3);
    await db.employees.bulkAdd([
      employeeLine({ periodId: p1.id, name: "Ana Torres", area: "COCINA" }),
      employeeLine({ periodId: p1.id, name: "Luis Vera", area: "VENTAS" }),
      employeeLine({ periodId: p2.id, name: "Ana Torres", area: "COCINA" }),
    ]);

    const lines = await employeesForPeriods([p1.id, p2.id]);

    expect(
      lines
        .get(p1.id)
        ?.map((line) => line.name)
        .sort(),
    ).toEqual(["Ana Torres", "Luis Vera"]);
    expect(lines.get(p2.id)).toHaveLength(1);
  });

  it("un período registrado y sin nómina llega con una lista vacía, no ausente", async () => {
    // «Registrado y sin empleados» no es lo mismo que «no existe»: el grid dibuja su columna en
    // blanco en vez de omitirla.
    const period = await createPeriod(clientId, 2026, 2);

    expect((await employeesForPeriods([period.id])).get(period.id)).toEqual([]);
  });

  it("no devuelve nada de un período que no se pidió", async () => {
    const pedido = await createPeriod(clientId, 2026, 2);
    const otro = await createPeriod(clientId, 2026, 3);
    await db.employees.add(employeeLine({ periodId: otro.id, name: "Luis Vera" }));

    const lines = await employeesForPeriods([pedido.id]);

    expect([...lines.keys()]).toEqual([pedido.id]);
  });

  it("una lista vacía no consulta nada", async () => {
    expect(await employeesForPeriods([])).toEqual(new Map());
  });
});

describe("periodFinancials", () => {
  it("suma el rol CALCULADO de cada período, agrupando en una sola consulta", async () => {
    const p1 = await createPeriod(clientId, 2026, 2);
    const p2 = await createPeriod(clientId, 2026, 3);
    const ana = employeeLine({ periodId: p1.id, name: "Ana Torres", baseSalary: 500 });
    const luis = employeeLine({ periodId: p1.id, name: "Luis Vera", baseSalary: 300 });
    await db.employees.bulkAdd([ana, luis]);

    const financials = await periodFinancials([p1.id, p2.id]);

    // Contra la MISMA derivación pura que la pantalla usa: lo que esta prueba afirma es el
    // acotado y el agrupado por período, no la aritmética del motor —esa la fija `golden.test.ts`.
    expect(financials.get(p1.id)).toEqual(
      computePeriodFinancials(
        [ana, luis].map((line) => computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS)),
      ),
    );
    expect(financials.has(p2.id)).toBe(false);
  });

  it("un empleado sin NADA capturado ya totaliza: el motor deriva su rol de la ficha", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await db.employees.add(employeeLine({ periodId: period.id }));

    expect((await periodFinancials([period.id])).get(period.id)?.net).toBeGreaterThan(0);
  });

  it("un período SIN empleados no aparece en el mapa — no es cero, es «no hay»", async () => {
    const period = await createPeriod(clientId, 2026, 2);

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

describe("updateEmployee · el parche de FICHA", () => {
  // Es la garantía que hace segura la edición: alguien arregla una cédula y lo capturado —las
  // horas, los descuentos, lo pagado— sigue exactamente donde estaba.
  it("corrige la identidad sin tocar la captura del mes", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    const capture = { ...emptyCapture(), bonus: 40, paid: 561.89 };
    const stored = await addEmployee(period.id, {
      ...employeeLine({ name: "Ana Torrez", idCard: "0102030499" }),
      capture,
    });

    await updateEmployee(stored.id, { name: "Ana Torres", idCard: "0102030405" });

    const [line] = await listEmployees(period.id);
    expect(line.name).toBe("Ana Torres");
    expect(line.idCard).toBe("0102030405");
    expect(line.capture).toEqual(capture);
  });

  it("escribe las dos provisiones, y el motor las recoge", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    const stored = await addEmployee(period.id, employeeLine());

    await updateEmployee(stored.id, { provisionsThirteenth: true });

    const [line] = await listEmployees(period.id);
    expect(
      computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS).thirteenthProvision,
    ).toBeGreaterThan(0);
  });

  it("alcanza SOLO al empleado de su período: el mismo de otro mes no se toca", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    const febrero = await createPeriod(clientId, 2026, 1);
    const enMarzo = await addEmployee(marzo.id, employeeLine({ role: "Recepcionista" }));
    await addEmployee(febrero.id, employeeLine({ role: "Recepcionista" }));

    await updateEmployee(enMarzo.id, { role: "Cajera" });

    expect((await listEmployees(marzo.id))[0].role).toBe("Cajera");
    expect((await listEmployees(febrero.id))[0].role).toBe("Recepcionista");
  });
});

describe("deleteEmployee", () => {
  it("quita solo a ese empleado y deja la nómina del período intacta", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    const uno = await addEmployee(period.id, employeeLine({ name: "Ana Torres" }));
    await addEmployee(period.id, employeeLine({ name: "Luis Vera" }));

    await deleteEmployee(uno.id);

    expect((await listEmployees(period.id)).map((l) => l.name)).toEqual(["Luis Vera"]);
  });

  it("no toca la nómina de otro período", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    const febrero = await createPeriod(clientId, 2026, 1);
    const enMarzo = await addEmployee(marzo.id, employeeLine());
    await addEmployee(febrero.id, employeeLine());

    await deleteEmployee(enMarzo.id);

    expect(await listEmployees(marzo.id)).toHaveLength(0);
    expect(await listEmployees(febrero.id)).toHaveLength(1);
  });

  it("un id que no existe no rompe nada", async () => {
    await expect(deleteEmployee(crypto.randomUUID())).resolves.toBeUndefined();
  });
});

describe("migración v3 → v4: las provisiones suben de la captura a la ficha", () => {
  /** La ficha como la v3 la guardaba: SIN las dos banderas, que vivían dentro de la captura.
   *  Quitarlas del factory es lo que hace que estos tests fallen si la migración desaparece. */
  function v3Line(overrides: Partial<PayrollEmployeeLine> = {}): Record<string, unknown> {
    const {
      provisionsThirteenth: _t,
      provisionsFourteenth: _f,
      capture: _c,
      ...ficha
    } = employeeLine(overrides);
    return ficha;
  }

  /** Una base tal como la v3 la dejaba, con las dos banderas DENTRO de la captura. */
  async function seedV3(lines: readonly Record<string, unknown>[]): Promise<void> {
    db.close();
    await Dexie.delete("liderboard-payroll");

    const legacy = new Dexie("liderboard-payroll");
    legacy.version(1).stores({
      clients: "id",
      periods: "id, clientId, &[clientId+year+monthIndex]",
      active: "key",
    });
    legacy.version(2).stores({ employees: "id, periodId" });
    legacy.version(3).stores({});
    await legacy.open();
    await legacy.table("employees").bulkAdd(lines as never[]);
    legacy.close();
  }

  async function reseed(): Promise<void> {
    await db.clients.clear();
    await db.periods.clear();
    await db.employees.clear();
    await db.active.clear();
  }

  it("una bandera encendida sobrevive, y sale de la captura", async () => {
    await seedV3([
      {
        ...v3Line({ id: "e1", periodId: "p1" }),
        capture: { ...emptyCapture(), provisionsThirteenth: true, provisionsFourteenth: false },
      },
    ]);

    await db.open();

    const [migrated] = await listEmployees("p1");
    expect(migrated.provisionsThirteenth).toBe(true);
    expect(migrated.provisionsFourteenth).toBe(false);
    expect(migrated.capture).not.toHaveProperty("provisionsThirteenth");
    expect(migrated.capture).not.toHaveProperty("provisionsFourteenth");

    await reseed();
  });

  it("y el motor la lee desde ahí: el costo empresa sigue llevando su provisión", async () => {
    // Es lo que hace que la migración importe. Sin ella la bandera se leería como apagada y el
    // único síntoma sería un costo total más bajo, que nadie compara contra el mes anterior.
    await seedV3([
      {
        ...v3Line({ id: "e1", periodId: "p1" }),
        capture: { ...emptyCapture(), provisionsThirteenth: true, provisionsFourteenth: false },
      },
    ]);

    await db.open();

    const [migrated] = await listEmployees("p1");
    const computed = computeLinePayroll(migrated, DEFAULT_PAYROLL_PARAMETERS);
    expect(computed.thirteenthProvision).toBeGreaterThan(0);
    expect(computed.fourteenthProvision).toBe(0);

    await reseed();
  });

  it("un empleado SIN captura llega con las dos apagadas, no con `undefined`", async () => {
    await seedV3([v3Line({ id: "e2", periodId: "p1" })]);

    await db.open();

    const [migrated] = await listEmployees("p1");
    expect(migrated.provisionsThirteenth).toBe(false);
    expect(migrated.provisionsFourteenth).toBe(false);
    expect(migrated.capture).toBeUndefined();

    await reseed();
  });
});

describe("importRoster", () => {
  it("escribe la nómina que trajo el archivo, con su captura intacta", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    const capture = { ...emptyCapture(), bonus: 40, paid: 561.89 };

    await importRoster(period.id, [{ ...employeeLine({ name: "Silvia Morales" }), capture }]);

    const stored = await listEmployees(period.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Silvia Morales");
    expect(stored[0].capture).toEqual(capture);
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
    await importRoster(period.id, [employeeLine()]);
    const [stored] = await listEmployees(period.id);

    const capture = { ...emptyCapture(), overtimeHours50: 5.5, paid: 457.69 };
    await updateEmployee(stored.id, { capture });

    const [reloaded] = await listEmployees(period.id);
    expect(reloaded.capture).toEqual(capture);
  });

  it("guarda los campos de ficha que la pantalla edita", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine()]);
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
    await importRoster(period.id, [employeeLine()]);
    const [stored] = await listEmployees(period.id);
    await updateEmployee(stored.id, { capture: { ...emptyCapture(), bonus: 40 } });

    await updateEmployee(stored.id, { days: 20 });

    const [reloaded] = await listEmployees(period.id);
    expect(reloaded.days).toBe(20);
    expect(reloaded.name).toBe(stored.name);
    expect(reloaded.capture?.bonus).toBe(40);
  });

  it("un empleado que no existe no crea uno nuevo", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine()]);

    await updateEmployee("no-existe", { days: 99 });

    const lines = await listEmployees(period.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].days).not.toBe(99);
  });
});

describe("addEmployee", () => {
  it("agrega un empleado y le estampa el dueño en la puerta", async () => {
    const period = await createPeriod(clientId, 2026, 2);

    const added = await addEmployee(period.id, employeeLine({ name: "Silvia Morales" }));

    expect(added.periodId).toBe(period.id);
    expect(added.id).toBeTruthy();
    const stored = await listEmployees(period.id);
    expect(stored.map((line) => line.name)).toEqual(["Silvia Morales"]);
  });

  // Al revés que `importRoster`, que reemplaza el mes entero: un alta es una fila más.
  it("no reemplaza la nómina que el período ya tiene", async () => {
    const period = await createPeriod(clientId, 2026, 2);
    await importRoster(period.id, [employeeLine({ name: "Pedro Sandoval" })]);

    await addEmployee(period.id, employeeLine({ name: "Silvia Morales" }));

    expect((await listEmployees(period.id)).map((line) => line.name).sort()).toEqual([
      "Pedro Sandoval",
      "Silvia Morales",
    ]);
  });

  it("dos altas seguidas son dos empleados, con ids distintos", async () => {
    const period = await createPeriod(clientId, 2026, 2);

    const first = await addEmployee(period.id, employeeLine({ name: "Silvia Morales" }));
    const second = await addEmployee(period.id, employeeLine({ name: "Pedro Sandoval" }));

    expect(first.id).not.toBe(second.id);
    expect(await listEmployees(period.id)).toHaveLength(2);
  });

  it("no toca la nómina de otro período", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    const abril = await createPeriod(clientId, 2026, 3);
    await importRoster(abril.id, [employeeLine({ name: "Nómina de abril" })]);

    await addEmployee(marzo.id, employeeLine({ name: "Alta de marzo" }));

    expect((await listEmployees(abril.id)).map((line) => line.name)).toEqual(["Nómina de abril"]);
  });

  // La misma distinción que `copyRoster`: sin captura no es con la captura en ceros.
  it("un alta sin captura se guarda sin captura, no con una vacía", async () => {
    const period = await createPeriod(clientId, 2026, 2);

    const added = await addEmployee(period.id, employeeLine());

    expect(added.capture).toBeUndefined();
    expect((await listEmployees(period.id))[0].capture).toBeUndefined();
  });
});

describe("las filas de bono", () => {
  const bono = (id: string, label: string, amount: number) => ({
    id,
    label,
    kind: "noAportable" as const,
    amount,
  });

  it("viven en la CAPTURA del empleado, no en el período", async () => {
    const period = await createPeriod(clientId, 2026, 6);
    await addEmployee(period.id, employeeLine({ periodId: period.id }));
    const [line] = await listEmployees(period.id);

    await updateEmployee(line.id, {
      capture: { ...emptyCapture(), extras: [bono("x1", "Movilización", 45)] },
    });

    const [after] = await listEmployees(period.id);
    expect(after.capture?.extras).toEqual([bono("x1", "Movilización", 45)]);
    // El período no guarda nada de esto: por eso su rol se calcula sin leerlo.
    expect(await listPeriods(clientId)).toMatchObject([{ id: period.id }]);
    expect((await listPeriods(clientId))[0]).not.toHaveProperty("extraConcepts");
  });

  it("dos empleados pueden declarar filas distintas en el mismo mes", async () => {
    const period = await createPeriod(clientId, 2026, 6);
    await importRoster(period.id, [employeeLine({ name: "Ana" }), employeeLine({ name: "Luis" })]);
    const [ana, luis] = await listEmployees(period.id);

    await updateEmployee(ana.id, {
      capture: { ...emptyCapture(), extras: [bono("x1", "Movilización", 45)] },
    });
    await updateEmployee(luis.id, {
      capture: { ...emptyCapture(), extras: [bono("x1", "Alimentación", 30)] },
    });

    const stored = await listEmployees(period.id);
    expect(stored.map((line) => line.capture?.extras?.[0]?.label).sort()).toEqual([
      "Alimentación",
      "Movilización",
    ]);
  });

  it("copiar la nómina arrastra las DECLARACIONES y ningún importe", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    await addEmployee(marzo.id, employeeLine({ periodId: marzo.id }));
    const [enMarzo] = await listEmployees(marzo.id);
    await updateEmployee(enMarzo.id, {
      capture: {
        ...emptyCapture(),
        labels: { "E-11": "Uniformes" },
        extras: [bono("x1", "Movilización", 45)],
      },
    });

    const abril = await createPeriod(clientId, 2026, 3, { copyFrom: marzo.id });
    const [enAbril] = await listEmployees(abril.id);

    // La fila es la MISMA de un mes a otro —conserva su id, su rótulo y su clase— y llega en cero.
    expect(enAbril.capture?.extras).toEqual([bono("x1", "Movilización", 0)]);
    // El rótulo de una fila del CATÁLOGO no viaja: su fila tampoco, porque su importe no viaja.
    expect(enAbril.capture?.labels).toBeUndefined();
  });

  it("sin filas de bono la copia sigue dejando la captura AUSENTE", async () => {
    const marzo = await createPeriod(clientId, 2026, 2);
    await addEmployee(marzo.id, employeeLine({ periodId: marzo.id }));
    const abril = await createPeriod(clientId, 2026, 3, { copyFrom: marzo.id });
    expect((await listEmployees(abril.id))[0].capture).toBeUndefined();
  });

  it("los totales del período INCLUYEN las filas de bono", async () => {
    const period = await createPeriod(clientId, 2026, 6);
    await addEmployee(period.id, employeeLine({ periodId: period.id, days: 30 }));
    const sin = (await periodFinancials([period.id])).get(period.id)!;

    const [line] = await listEmployees(period.id);
    await updateEmployee(line.id, {
      capture: { ...emptyCapture(), extras: [bono("x1", "Movilización", 50)] },
    });

    const con = (await periodFinancials([period.id])).get(period.id)!;
    expect(con.gross - sin.gross).toBeCloseTo(50, 8);
  });
});

describe("el rótulo propio de una fila del catálogo", () => {
  it("se guarda en la captura, por código, y es de ESE empleado", async () => {
    const period = await createPeriod(clientId, 2026, 6);
    await importRoster(period.id, [employeeLine({ name: "Ana" }), employeeLine({ name: "Luis" })]);
    const [ana, luis] = await listEmployees(period.id);

    await updateEmployee(ana.id, {
      capture: { ...emptyCapture(), labels: { "E-11": "Uniformes" } },
    });

    const stored = await listEmployees(period.id);
    expect(stored.find((line) => line.id === ana.id)?.capture?.labels).toEqual({
      "E-11": "Uniformes",
    });
    expect(stored.find((line) => line.id === luis.id)?.capture?.labels).toBeUndefined();
  });
});
