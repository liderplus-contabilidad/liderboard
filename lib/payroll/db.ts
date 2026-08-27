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
import type { CostCenter } from "@/lib/cost-center";
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
    // v2: the employee's record (`PayrollEmployeeLine`), what a nómina copy drags along. Purely
    // ADDITIVE — Dexie does not downgrade, and v1 may already exist in the browser of whoever tried
    // the module before this change — so only the new table is added; nothing of v1 is touched or
    // re-declared.
    this.version(2).stores({
      employees: "id, periodId",
    });
    // v3: a rol row's label moves from the PERÍODO to the employee's CAPTURE. No index changes
    // —neither `extraConcepts` nor `extraAmounts` ever were indexed—, so this version exists ONLY to
    // run its `upgrade`. It is a reshape, not a deletion: the período's declaration and each
    // capture's amount are read and the whole row is written, with both things inside it. Nothing is
    // cleared until the lines are written, and everything happens inside the upgrade's transaction,
    // because Dexie does not downgrade.
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
          // An employee WITHOUT a capture of a período that did declare gets their rows at zero all
          // the same: it is exactly what the screen showed them, and not giving them would erase
          // them.
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
    // v4: the two décimo provision flags move up from the CAPTURE to the RECORD — they are a choice
    // of the employee and not a datum of the month, the same reason the two reserve-fund ones were
    // already there (see `PayrollEmployeeLine`). No index changes, so this version exists ONLY to run
    // its `upgrade`.
    //
    // With the real March 2026 file it is a no-op —switched off in all six employees—, but the
    // opposite case exists and losing it would be invisible: a flag that was on would stop
    // provisioning and the only thing that would move is the total employer cost, which nobody
    // compares against last month. That is why the datum is migrated instead of being read with a
    // `??` from the old place, which would leave both shapes alive forever.
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

/** The shape `PayrollPeriod.extraConcepts` had up to v2. It is declared here and not in `types.ts`
 *  because the migration is the only code that ever sees it again. */
interface LegacyExtraConcept {
  id: string;
  label: string;
  kind: PayrollExtraConceptKind;
}

/** The record as v3 stored it: with the two provisions INSIDE the capture. Here and not in `types.ts`
 *  for the same reason — it is a dead shape, and giving it room among the live types would invite
 *  reading it as a current alternative. */
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
  costCenter?: CostCenter,
): Promise<PayrollClient> {
  const client: PayrollClient = {
    id: crypto.randomUUID(),
    name,
    ...(logo ? { logo } : {}),
    ...(company ? { company } : {}),
    ...(costCenter ? { costCenter } : {}),
  };
  await db.transaction("rw", db.clients, db.active, async () => {
    await db.clients.add(client);
    await db.active.put({ key: ACTIVE_KEY, clientId: client.id });
  });
  return client;
}

/**
 * Changes the cliente's LABEL — its name, its logo, its company profile and its centro de costo —
 * and NOTHING else: no período and no nómina is touched. All four travel in one write because the
 * dialog edits them together; `logo: null` removes it, and an `undefined` in a Dexie `update` deletes
 * the property, which is exactly what that means here.
 *
 * The profile arrives `null` only from a module that does not ask for it; in Rol de Pagos the dialog
 * requires it, so saving a client is also the way an old one stops being incomplete. The center is
 * ALWAYS optional, so `undefined` is its way of going: emptying its name in the dialog deletes the
 * field, which is what returns the paper to its former shape.
 */
export async function updateClient(
  clientId: string,
  name: string,
  logo: EntityLogo | null,
  company?: CompanyProfile | null,
  costCenter?: CostCenter | null,
): Promise<void> {
  await db.clients.update(clientId, {
    name,
    logo: logo ?? undefined,
    ...(company === undefined ? {} : { company: company ?? undefined }),
    ...(costCenter === undefined ? {} : { costCenter: costCenter ?? undefined }),
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
 * Creates an empty período: born `"captura"`, `totals` absent — there are no computations yet. The
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
    // The bonus rows are dragged along by `copyRoster`, which is the only definition of what survives
    // from one período to another. They used to be copied here, at período level, outside that
    // definition.
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
// Nómina (each employee's record of a período)
// ---------------------------------------------------------------------------

/** The nómina of ONE período, in no particular order — what a copy drags along. */
export async function listEmployees(periodId: string): Promise<PayrollEmployeeLine[]> {
  return db.employees.where("periodId").equals(periodId).toArray();
}

/**
 * Writes the nómina a file brought in, REPLACING whatever the período held, in ONE transaction.
 *
 * Replacing and not merging is right because the rol de pagos IS the whole month: its `GENERAL` sheet
 * lists every employee who was paid. Merging would leave alive whoever the accountant removed —they
 * would keep adding up in the KPIs without appearing in any file— and no control on the screen could
 * notice. That is also why it is safe for the same month to be loaded twice: the second upload leaves
 * exactly what the file says again.
 *
 * What is lost on replacing is the record copied from the previous month, and that is precisely what
 * is wanted: the file brings its own record and it is the accountant's.
 */
/**
 * What can be rewritten of an employee, through the TWO doors the screen has:
 *
 *   - **the month**, inline in the detail: `days`, `baseSalary` and the whole capture. It is written
 *     field by field, on leaving each input, so the net pay moves in plain sight.
 *   - **the record**, from the edit dialog: identity, contract, reserve fund and the two provisions.
 *     They were not here before and the comment pointed at «the record», which did not exist as a
 *     screen: a mistyped cédula could only be fixed by deleting the período or reloading the Excel.
 *
 * The patch reaches ONLY the employee of THEIR período: each período stores its own copy of the
 * nómina, just as the accountant has a `GENERAL` sheet per month, so correcting March does not
 * rewrite February. The correction travels forward on its own when `copyRoster` creates April.
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
 * Writes a PARTIAL patch over an employee. Dexie's `update` merges instead of replacing, so
 * correcting `days` does not take the name or what was captured with it — which matters because this
 * screen writes one field at a time, as each input is left.
 *
 * An `id` that does not exist creates nothing: `update` returns 0 and that is that. It is the right
 * answer to an employee deleted in another tab while this one had them open.
 */
export async function updateEmployee(
  employeeId: string,
  patch: PayrollEmployeePatch,
): Promise<void> {
  await db.employees.update(employeeId, patch);
}

/**
 * Adds ONE employee to a período's nómina, without touching the one it already has — the opposite of
 * `importRoster`, which replaces the whole month because a file IS the whole month. Adding one by
 * hand is one more row, and that is why there is no transaction: it is a single write.
 *
 * The owner is stamped HERE, at the door, just as in `importRoster` and in the nómina copy: which
 * período an employee belongs to is decided by the período that is open, never by what the record
 * brings. That is why the argument is a `ParsedPayrollEmployeeLine`, with no `id` and no `periodId`.
 *
 * It returns the already stamped record so the caller can navigate to it without re-reading the
 * table.
 *
 * What it does NOT do is validate: what is required and what shape a cédula has belongs to
 * `lib/payroll/employee-form.ts`, which runs where it can say WHICH field is wrong. The duplicate
 * cédula is checked there for the same reason — here it could only be rejected without explaining.
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
 * Removes ONE employee from their período's nómina. A single write, with no transaction, and without
 * touching the rest of the nómina — the opposite of `importRoster`, which replaces the whole month
 * because a file IS the whole month.
 *
 * It reaches only the período they are in: the same employee in another month is another row, and
 * removing them in March cannot erase the March that was already paid in January.
 *
 * An `id` that does not exist does not fail: `delete` finds nothing and that is that. It is the right
 * answer to an employee deleted in another tab while this one had them open.
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
 * Counts employees and distinct areas of SEVERAL períodos at once, in a single query — the EMPLEADOS
 * column of the whole table and the summary read it from here, instead of one query per row. Each
 * `periodId` must belong to a client already known to the caller (never an unbounded read).
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
 * The nómina of SEVERAL períodos at once, grouped by `periodId` — a single query behind Sueldos por
 * Áreas, which reads every visible período instead of one per row. The same batched pattern as
 * `rosterCounts` and `periodFinancials`.
 *
 * It returns the RECORDS and not a total because the caller groups them by area and by employee and
 * derives the cost with the engine; aggregating them here would force this function to know the bar's
 * marks, which is precisely what would keep it coupled to a screen.
 *
 * A requested período with no nómina appears with an empty list: it is «registered and with no
 * employees», which is not the same as a período that does not exist — and that distinction is what
 * lets the grid draw its column blank instead of omitting it.
 *
 * Each `periodId` must belong to a client already resolved by the caller: never an unbounded read,
 * which is what separates the nómina of two companies.
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
 * The four totals (`gross`/`deductions`/`net`/`cost`) of SEVERAL períodos at once, in a single query
 * — the same batched precedent as `rosterCounts`. The derivation belongs to `computePeriodFinancials`
 * (`lib/payroll/period-detail.ts`, pure and tested) over the rol the engine computes per line
 * (`computeLinePayroll`); this function only does the bounded read and groups by período. A período
 * WITHOUT employees does not appear in the map — it is not zero, it is «there is none».
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
