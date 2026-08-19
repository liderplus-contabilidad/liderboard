/**
 * IndexedDB persistence via Dexie, and the ONLY door to it — the same rule PyG's and Ocupaciones'
 * `db.ts` follow: with several clientes sharing these tables, an unbounded query mixes two
 * companies' nómina in silence, and nothing above can tell. Every read and write below takes a
 * `clientId`.
 *
 * A SEPARATE database (`liderboard-payroll`) from PyG's and Ocupaciones': a cliente of Rol de
 * Pagos and a cliente of PyG are not the same row, even when the contador calls them by the same
 * name — the same resolution already standing between those two modules.
 */
import Dexie, { type Table } from "dexie";
import type { CompanyProfile } from "@/lib/company-profile";
import { sortByName, type EntityLogo } from "@/lib/workspaces";
import { computeLinePayroll, emptyCapture } from "./employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import { computePeriodFinancials, type PayrollPeriodFinancials } from "./period-detail";
import { sortPeriodsDesc } from "./periods";
import { copyRoster } from "./roster";
import type {
  ParsedPayrollEmployeeLine,
  PayrollClient,
  PayrollEmployeeLine,
  PayrollExtraConceptKind,
  PayrollMonthlyCapture,
  PayrollPeriod,
  PayrollRosterSummary,
} from "./types";

/** The one-row table that remembers which cliente is open, so it survives a reload. */
interface ActiveClientRow {
  key: "active";
  clientId: string | null;
}

const ACTIVE_KEY = "active";

class PayrollDb extends Dexie {
  clients!: Table<PayrollClient, string>;
  periods!: Table<PayrollPeriod, string>;
  employees!: Table<PayrollEmployeeLine, string>;
  active!: Table<ActiveClientRow, string>;

  constructor() {
    super("liderboard-payroll");
    this.version(1).stores({
      clients: "id",
      // The compound index is UNIQUE (`&`): a cliente cannot hold the same (year, mes) twice, and
      // Dexie rejects the second `add` instead of silently overwriting the first.
      periods: "id, clientId, &[clientId+year+monthIndex]",
      active: "key",
    });
    // v2: la ficha del empleado (`PayrollEmployeeLine`), lo que una copia de nómina arrastra.
    // Puramente ADITIVA — Dexie no baja de versión, y la v1 puede existir ya en el navegador de
    // quien probó el módulo antes de este cambio — así que solo se agrega la tabla nueva; nada de
    // lo de v1 se toca ni se re-declara.
    this.version(2).stores({
      employees: "id, periodId",
    });
    // v3: el rótulo de una fila del rol se muda del PERÍODO a la CAPTURA del empleado. Ningún
    // índice cambia —ni `extraConcepts` ni `extraAmounts` lo estaban nunca—, así que esta versión
    // existe SOLO para correr su `upgrade`. Es un reshape, no un borrado: se lee la declaración del
    // período y el importe de cada captura y se escribe la fila entera, con las dos cosas dentro.
    // Nada se limpia hasta que las líneas están escritas, y todo ocurre en la transacción de la
    // actualización, porque Dexie no baja de versión.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const periods = await tx.table("periods").toArray();
        const declaring = new Map<string, LegacyExtraConcept[]>(
          periods
            .filter((period) => (period.extraConcepts?.length ?? 0) > 0)
            .map((period) => [period.id as string, period.extraConcepts as LegacyExtraConcept[]]),
        );
        if (declaring.size === 0) {
          return;
        }

        const employees = await tx.table("employees").toArray();
        for (const line of employees) {
          const concepts = declaring.get(line.periodId as string);
          if (!concepts) {
            continue;
          }
          // Un empleado SIN captura de un período que sí declaraba recibe igualmente sus filas en
          // cero: es exactamente lo que la pantalla le mostraba, y no dárselas las borraría.
          const capture = line.capture ?? emptyCapture();
          const amounts = (capture.extraAmounts ?? {}) as Record<string, number>;
          delete capture.extraAmounts;
          capture.extras = concepts.map((concept) => ({
            id: concept.id,
            label: concept.label,
            kind: concept.kind,
            amount: amounts[concept.id] ?? 0,
          }));
          await tx.table("employees").put({ ...line, capture });
        }

        for (const period of periods) {
          if (declaring.has(period.id as string)) {
            const { extraConcepts: _dropped, ...rest } = period;
            await tx.table("periods").put(rest);
          }
        }
      });
    // v4: las dos banderas de provisión de décimos suben de la CAPTURA a la FICHA — son una
    // elección del empleado y no un dato del mes, la misma razón por la que las dos del fondo de
    // reserva ya estaban ahí (ver `PayrollEmployeeLine`). Ningún índice cambia, así que esta
    // versión existe SOLO para correr su `upgrade`.
    //
    // Con el archivo real de marzo 2026 es un no-op —apagadas en los seis empleados—, pero el caso
    // contrario existe y perderlo sería invisible: una bandera encendida dejaría de provisionar y
    // lo único que se movería es el costo total empresa, que nadie compara contra el mes anterior.
    // Por eso se migra el dato en vez de leerlo con un `??` desde el sitio viejo, que dejaría las
    // dos formas vivas para siempre.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<LegacyLineWithProvisions>("employees")
          .toCollection()
          .modify((line) => {
            line.provisionsThirteenth = line.capture?.provisionsThirteenth ?? false;
            line.provisionsFourteenth = line.capture?.provisionsFourteenth ?? false;
            if (line.capture) {
              delete line.capture.provisionsThirteenth;
              delete line.capture.provisionsFourteenth;
            }
          });
      });
  }
}

/** La forma que `PayrollPeriod.extraConcepts` tenía hasta la v2. Se declara aquí y no en
 *  `types.ts` porque la migración es el único código que vuelve a verla. */
interface LegacyExtraConcept {
  id: string;
  label: string;
  kind: PayrollExtraConceptKind;
}

/** La ficha tal como la v3 la guardaba: con las dos provisiones DENTRO de la captura. Aquí y no en
 *  `types.ts` por lo mismo — es una forma muerta, y darle sitio entre los tipos vivos invitaría a
 *  leerla como una alternativa vigente. */
type LegacyLineWithProvisions = PayrollEmployeeLine & {
  capture?: PayrollMonthlyCapture & {
    provisionsThirteenth?: boolean;
    provisionsFourteenth?: boolean;
  };
};

export const db = new PayrollDb();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

/** Every cliente, ordered by name — the list's only order. */
export async function listClients(): Promise<PayrollClient[]> {
  return sortByName(await db.clients.toArray());
}

export async function getClient(clientId: string): Promise<PayrollClient | undefined> {
  return db.clients.get(clientId);
}

/**
 * Creates an EMPTY cliente and opens it. The name is taken as given: validation and duplicate
 * checking are `useEntityNaming`'s job, run where the caller can say what is wrong.
 */
export async function createClient(
  name: string,
  logo?: EntityLogo,
  company?: CompanyProfile,
): Promise<PayrollClient> {
  const client: PayrollClient = {
    id: crypto.randomUUID(),
    name,
    ...(logo ? { logo } : {}),
    ...(company ? { company } : {}),
  };
  await db.transaction("rw", db.clients, db.active, async () => {
    await db.clients.add(client);
    await db.active.put({ key: ACTIVE_KEY, clientId: client.id });
  });
  return client;
}

/**
 * Changes the cliente's LABEL — its name, its logo and its company profile — and NOTHING else: no
 * período and no nómina is touched. The three travel in one write because the dialog edits them
 * together; `logo: null` removes it, and an `undefined` in a Dexie `update` deletes the property,
 * which is what that means here.
 *
 * El perfil llega `null` solo desde un módulo que no lo pide; en Rol de Pagos el diálogo lo exige,
 * así que guardar un cliente es también la vía por la que uno antiguo deja de estar incompleto.
 */
export async function updateClient(
  clientId: string,
  name: string,
  logo: EntityLogo | null,
  company?: CompanyProfile | null,
): Promise<void> {
  await db.clients.update(clientId, {
    name,
    logo: logo ?? undefined,
    ...(company === undefined ? {} : { company: company ?? undefined }),
  });
}

/**
 * Deletes a cliente, every período that hangs off it, AND the nómina of those períodos, in ONE
 * transaction. No other cliente is touched.
 *
 * Deleting the OPEN cliente hands the module to the first remaining one BY NAME; deleting the last
 * one leaves no active cliente, and the module falls back to its empty state.
 */
export async function deleteClient(clientId: string): Promise<void> {
  await db.transaction("rw", db.clients, db.periods, db.employees, db.active, async () => {
    const doomed = await db.periods.where("clientId").equals(clientId).primaryKeys();
    await db.employees.where("periodId").anyOf(doomed).delete();
    await db.periods.bulkDelete(doomed);
    await db.clients.delete(clientId);

    const active = await db.active.get(ACTIVE_KEY);
    if (active?.clientId !== clientId) {
      return;
    }
    const remaining = sortByName(await db.clients.toArray());
    await db.active.put({ key: ACTIVE_KEY, clientId: remaining[0]?.id ?? null });
  });
}

export async function setActiveClient(clientId: string | null): Promise<void> {
  await db.active.put({ key: ACTIVE_KEY, clientId });
}

/** The open cliente's id, or `null` — which is also what a brand-new install reads. */
export async function getActiveClientId(): Promise<string | null> {
  return (await db.active.get(ACTIVE_KEY))?.clientId ?? null;
}

/** One cliente as the selector shows it: its label and what it holds. */
export interface PayrollClientSummary extends PayrollClient {
  periodCount: number;
  /** Ascending; `[]` for a cliente with no períodos. */
  years: number[];
}

/** Every cliente with its período count and years — ONE query behind the selector's sublines. */
export async function listClientSummaries(): Promise<PayrollClientSummary[]> {
  const [clients, periods] = await Promise.all([db.clients.toArray(), db.periods.toArray()]);
  const byClient = new Map<string, PayrollPeriod[]>();
  for (const period of periods) {
    byClient.set(period.clientId, [...(byClient.get(period.clientId) ?? []), period]);
  }
  return sortByName(
    clients.map((client) => {
      const own = byClient.get(client.id) ?? [];
      return {
        ...client,
        periodCount: own.length,
        years: [...new Set(own.map((period) => period.year))].sort((a, b) => a - b),
      };
    }),
  );
}

/** What deleting a cliente discards, in the terms the confirmation counts in. */
export interface PayrollClientContents {
  periodCount: number;
  years: number[];
}

/**
 * Quantifies what deleting a cliente discards. Naming it in the abstract («sus períodos») is what
 * makes an irreversible action easy to confirm by accident, so the modal counts instead.
 */
export async function describeClientContents(clientId: string): Promise<PayrollClientContents> {
  const periods = await db.periods.where("clientId").equals(clientId).toArray();
  return {
    periodCount: periods.length,
    years: [...new Set(periods.map((period) => period.year))].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

/** Every período of ONE cliente, most-recent-first — the order Historial de nómina reads them. */
export async function listPeriods(clientId: string): Promise<PayrollPeriod[]> {
  const periods = await db.periods.where("clientId").equals(clientId).toArray();
  return sortPeriodsDesc(periods);
}

/**
 * Creates an empty período: born `"captura"`, `totals` ausente — no existen cálculos todavía. The
 * owner is stamped HERE, at the door, the same as every other module's `db.ts`.
 *
 * Duplicate rejection with a message that NAMES the period is the popover's job (it already holds
 * the loaded list); the unique compound index below is the safety net under it.
 *
 * With `copyFrom`, the período AND its nómina (copied via `copyRoster`) are written in ONE
 * transaction, so a failure partway through cannot leave a período half-populated.
 */
export async function createPeriod(
  clientId: string,
  year: number,
  monthIndex: number,
  options?: { copyFrom?: string },
): Promise<PayrollPeriod> {
  const period: PayrollPeriod = {
    id: crypto.randomUUID(),
    clientId,
    year,
    monthIndex,
    kind: "ordinario",
  };

  const copyFrom = options?.copyFrom;
  if (!copyFrom) {
    await db.periods.add(period);
    return period;
  }

  await db.transaction("rw", db.periods, db.employees, async () => {
    // Las filas de bono las arrastra `copyRoster`, que es la única definición de qué sobrevive de
    // un período a otro. Antes se copiaban aquí, a nivel de período, fuera de esa definición.
    await db.periods.add(period);
    const sourceLines = await db.employees.where("periodId").equals(copyFrom).toArray();
    const copiedLines: PayrollEmployeeLine[] = copyRoster(sourceLines).map((line) => ({
      ...line,
      id: crypto.randomUUID(),
      periodId: period.id,
    }));
    if (copiedLines.length > 0) {
      await db.employees.bulkAdd(copiedLines);
    }
  });
  return period;
}

/**
 * Deletes a período AND its nómina, in ONE transaction. No other período — of this cliente or any
 * other — is touched.
 */
export async function deletePeriod(periodId: string): Promise<void> {
  await db.transaction("rw", db.periods, db.employees, async () => {
    await db.employees.where("periodId").equals(periodId).delete();
    await db.periods.delete(periodId);
  });
}

// ---------------------------------------------------------------------------
// Nómina (la ficha de cada empleado de un período)
// ---------------------------------------------------------------------------

/** La nómina de UN período, sin orden particular — lo que arrastra una copia. */
export async function listEmployees(periodId: string): Promise<PayrollEmployeeLine[]> {
  return db.employees.where("periodId").equals(periodId).toArray();
}

/**
 * Escribe la nómina que trajo un archivo, REEMPLAZANDO la que el período tuviera, en UNA
 * transacción.
 *
 * Reemplazar y no fusionar es lo correcto porque el rol de pagos ES el mes entero: su hoja
 * `GENERAL` lista a todos los empleados que cobraron. Fusionar dejaría vivo a quien el contador
 * dio de baja —seguiría sumando en los KPIs sin aparecer en ningún archivo— y ningún control de la
 * pantalla podría notarlo. Por eso también es seguro que un mismo mes se cargue dos veces: la
 * segunda carga vuelve a dejar exactamente lo que el archivo dice.
 *
 * Lo que se pierde al reemplazar es la ficha copiada del mes anterior, y eso es justo lo que se
 * quiere: el archivo trae su propia ficha y es la del contador.
 */
/**
 * Lo que se puede reescribir de un empleado, por las DOS puertas que la pantalla tiene:
 *
 *   - **el mes**, en línea en el detalle: `days`, `baseSalary` y la captura entera. Se escribe
 *     campo a campo, al salir de cada input, para que el líquido se mueva a la vista.
 *   - **la ficha**, desde el diálogo de edición: identidad, contrato, fondo de reserva y las dos
 *     provisiones. Antes no estaban aquí y el comentario remitía a «la ficha», que no existía como
 *     pantalla: una cédula mal tecleada solo se arreglaba borrando el período o recargando el
 *     Excel.
 *
 * El parche alcanza SOLO al empleado de SU período: cada período guarda su propia copia de la
 * nómina, igual que el contador tiene una hoja `GENERAL` por mes, así que corregir marzo no
 * reescribe febrero. La corrección viaja hacia adelante sola cuando `copyRoster` crea abril.
 */
export type PayrollEmployeePatch = Partial<
  Pick<
    PayrollEmployeeLine,
    | "days"
    | "baseSalary"
    | "capture"
    | "name"
    | "role"
    | "area"
    | "contractType"
    | "idCard"
    | "hireDate"
    | "sectorCode"
    | "hasReserveFund"
    | "accumulatesReserveFund"
    | "provisionsThirteenth"
    | "provisionsFourteenth"
  >
>;

/**
 * Escribe un parche PARCIAL sobre un empleado. Dexie's `update` fusiona en vez de reemplazar, así
 * que corregir `days` no se lleva por delante ni el nombre ni lo capturado — que importa porque
 * esta pantalla escribe un campo cada vez, según se va saliendo de cada input.
 *
 * Un `id` que no existe no crea nada: `update` devuelve 0 y se acabó. Es la respuesta correcta a
 * un empleado borrado en otra pestaña mientras esta lo tenía abierto.
 */
export async function updateEmployee(
  employeeId: string,
  patch: PayrollEmployeePatch,
): Promise<void> {
  await db.employees.update(employeeId, patch);
}

/**
 * Agrega UN empleado a la nómina de un período, sin tocar la que ya tiene — al revés que
 * `importRoster`, que reemplaza el mes entero porque un archivo ES el mes entero. Un alta a mano
 * es una fila más, y por eso no hay transacción: es una sola escritura.
 *
 * El dueño se estampa AQUÍ, en la puerta, igual que en `importRoster` y en la copia de nómina: a
 * qué período pertenece un empleado lo decide el período que está abierto, nunca lo que traiga la
 * ficha. Por eso el argumento es una `ParsedPayrollEmployeeLine`, sin `id` ni `periodId`.
 *
 * Devuelve la ficha ya estampada para que quien la llama pueda navegar a ella sin releer la tabla.
 *
 * Lo que NO hace es validar: qué es obligatorio y qué forma tiene una cédula es de
 * `lib/payroll/employee-form.ts`, que corre donde se puede decir QUÉ campo está mal. El duplicado
 * de cédula se comprueba allí por la misma razón — aquí solo se podría rechazar sin explicar.
 */
export async function addEmployee(
  periodId: string,
  line: ParsedPayrollEmployeeLine,
): Promise<PayrollEmployeeLine> {
  const stored: PayrollEmployeeLine = { ...line, id: crypto.randomUUID(), periodId };
  await db.employees.add(stored);
  return stored;
}

/**
 * Quita UN empleado de la nómina de su período. Una sola escritura, sin transacción, y sin tocar
 * al resto de la nómina — al revés que `importRoster`, que reemplaza el mes entero porque un
 * archivo ES el mes entero.
 *
 * Alcanza solo al período donde está: el mismo empleado en otro mes es otra fila, y darlo de baja
 * en marzo no puede borrar el marzo que ya se pagó en enero.
 *
 * Un `id` que no existe no falla: `delete` no encuentra nada y se acabó. Es la respuesta correcta
 * a un empleado borrado en otra pestaña mientras esta lo tenía abierto.
 */
export async function deleteEmployee(employeeId: string): Promise<void> {
  await db.employees.delete(employeeId);
}

export async function importRoster(
  periodId: string,
  lines: readonly ParsedPayrollEmployeeLine[],
): Promise<void> {
  await db.transaction("rw", db.employees, async () => {
    await db.employees.where("periodId").equals(periodId).delete();
    if (lines.length > 0) {
      await db.employees.bulkAdd(
        lines.map((line) => ({ ...line, id: crypto.randomUUID(), periodId })),
      );
    }
  });
}

/**
 * Cuenta empleados y áreas distintas de VARIOS períodos a la vez, en una sola consulta — la
 * columna EMPLEADOS de toda la tabla y el resumen la leen de aquí, en vez de una consulta por
 * fila. Cada `periodId` debe pertenecer a un cliente ya conocido por quien llama (nunca una
 * lectura sin acotar).
 */
export async function rosterCounts(
  periodIds: readonly string[],
): Promise<Map<string, PayrollRosterSummary>> {
  const result = new Map<string, PayrollRosterSummary>();
  if (periodIds.length === 0) {
    return result;
  }
  const lines = await db.employees
    .where("periodId")
    .anyOf(periodIds as string[])
    .toArray();
  const byPeriod = new Map<string, PayrollEmployeeLine[]>();
  for (const line of lines) {
    byPeriod.set(line.periodId, [...(byPeriod.get(line.periodId) ?? []), line]);
  }
  for (const periodId of periodIds) {
    const own = byPeriod.get(periodId) ?? [];
    result.set(periodId, { employees: own.length, areas: new Set(own.map((l) => l.area)).size });
  }
  return result;
}

/**
 * La nómina de VARIOS períodos a la vez, agrupada por `periodId` — una sola consulta detrás de
 * Sueldos por Áreas, que lee todos los períodos visibles en vez de uno por fila. Mismo patrón
 * batcheado que `rosterCounts` y `periodFinancials`.
 *
 * Devuelve las FICHAS y no un total porque quien llama las agrupa por área y por empleado y deriva
 * el costo con el motor; agregarlas aquí obligaría a esta función a conocer las marcas de la barra,
 * que es justo lo que la mantendría acoplada a una pantalla.
 *
 * Un período pedido que no tiene nómina aparece con una lista vacía: es «registrado y sin
 * empleados», que no es lo mismo que un período que no existe — y esa distinción es la que deja al
 * grid dibujar su columna en blanco en vez de omitirla.
 *
 * Cada `periodId` debe pertenecer a un cliente ya resuelto por quien llama: nunca una lectura sin
 * acotar, que es lo que separa la nómina de dos empresas.
 */
export async function employeesForPeriods(
  periodIds: readonly string[],
): Promise<Map<string, PayrollEmployeeLine[]>> {
  const result = new Map<string, PayrollEmployeeLine[]>();
  if (periodIds.length === 0) {
    return result;
  }
  for (const periodId of periodIds) {
    result.set(periodId, []);
  }
  const lines = await db.employees
    .where("periodId")
    .anyOf(periodIds as string[])
    .toArray();
  for (const line of lines) {
    result.get(line.periodId)?.push(line);
  }
  return result;
}

/**
 * Los cuatro totales (`gross`/`deductions`/`net`/`cost`) de VARIOS períodos a la vez, en una sola
 * consulta — el mismo precedente batcheado que `rosterCounts`. La derivación es de
 * `computePeriodFinancials` (`lib/payroll/period-detail.ts`, puro y testeado) sobre el rol que el
 * motor calcula por línea (`computeLinePayroll`); esta función solo hace la lectura acotada y
 * agrupa por período. Un período SIN empleados no aparece en el mapa — no es cero, es «no hay».
 */
export async function periodFinancials(
  periodIds: readonly string[],
): Promise<Map<string, PayrollPeriodFinancials>> {
  const result = new Map<string, PayrollPeriodFinancials>();
  if (periodIds.length === 0) {
    return result;
  }
  const lines = await db.employees
    .where("periodId")
    .anyOf(periodIds as string[])
    .toArray();
  const byPeriod = new Map<string, PayrollEmployeeLine[]>();
  for (const line of lines) {
    byPeriod.set(line.periodId, [...(byPeriod.get(line.periodId) ?? []), line]);
  }
  for (const periodId of periodIds) {
    const financials = computePeriodFinancials(
      (byPeriod.get(periodId) ?? []).map((line) =>
        computeLinePayroll(line, DEFAULT_PAYROLL_PARAMETERS),
      ),
    );
    if (financials) {
      result.set(periodId, financials);
    }
  }
  return result;
}
