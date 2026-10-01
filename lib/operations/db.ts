import Dexie, { type Table } from "dexie";
import { validDate, validPeriod } from "@/lib/schedule/model";
import {
  createVault,
  openVault,
  seal,
  unseal,
  type Sealed,
  type VaultConfig,
} from "@/lib/credentials/vault";
import { mergeImported, newCompany, validateKeysImport } from "./model";
import { mergeObligationTasks } from "./obligation-tasks";
import { patchCompanyTaxValues } from "./company-tax";
import {
  addCompanyTab,
  addCompanyCustomField,
  moveCompanyField,
  removeCompanyCustomField,
  mergeCompanyDetails,
  configureCompanyField,
} from "./company-fields";
import type {
  Access,
  AccessValues,
  Company,
  CompanyValues,
  CompanyTaxValues,
  CompanyFieldType,
  KeysImport,
  Obligation,
  ScheduleImport,
  ScheduleTask,
  SourceSnapshot,
  TaskValues,
} from "./types";

interface StoredAccess {
  id: string;
  companyId: string;
  payload: Sealed;
}
type CompanyDetails = Pick<
  Company,
  | "fields"
  | "fieldEdits"
  | "customFields"
  | "fieldTabs"
  | "fieldCategories"
  | "taxEdits"
  | "fieldTypes"
>;
interface StoredCompany extends Omit<Company, "fields" | "fieldEdits"> {
  fields?: Company["fields"];
  fieldEdits?: Company["fieldEdits"];
  detail?: Sealed;
}
interface StoredSource {
  id: string;
  loadedOn: string;
  name: string;
  payload: Sealed;
}

class OperationsDatabase extends Dexie {
  companies!: Table<StoredCompany, string>;
  accesses!: Table<StoredAccess, string>;
  obligations!: Table<Obligation, string>;
  tasks!: Table<ScheduleTask, string>;
  sources!: Table<StoredSource, string>;
  meta!: Table<VaultConfig, string>;
  constructor() {
    super("liderboard-operations");
    this.version(1).stores({
      companies: "id",
      accesses: "id,companyId",
      obligations: "id,companyId",
      tasks: "id,companyId",
      sources: "id,loadedOn",
      meta: "id",
    });
    this.version(2)
      .stores({ tasks: "id,companyId" })
      .upgrade(async (transaction) => {
        const obligations = await transaction.table<Obligation>("obligations").toArray();
        const tasks = transaction.table<ScheduleTask>("tasks");
        const converted = mergeObligationTasks(obligations, await tasks.toArray());
        if (converted.length) await tasks.bulkPut(converted);
      });
    this.version(3).stores({ companies: "id" });
  }
}

/** The only door to the shared operations tables; credential payloads never leave it locked. */
export const operationsDb = new OperationsDatabase();

export async function readPublic() {
  const [companies, obligations, tasks, vault] = await Promise.all([
    operationsDb.companies.toArray(),
    operationsDb.obligations.toArray(),
    operationsDb.tasks.toArray(),
    operationsDb.meta.get("vault"),
  ]);
  return {
    companies: companies.map(publicCompany),
    obligations,
    tasks,
    hasVault: !!vault,
  };
}

function publicCompany(company: StoredCompany): Company {
  const { detail, ...values } = company;
  return {
    ...values,
    fields: values.fields ?? [],
    fieldEdits: values.fieldEdits ?? {},
    detailsPending: !!detail,
  };
}

async function companyDetails(company: StoredCompany, key?: CryptoKey): Promise<Company> {
  const { detail, ...publicFields } = company;
  if (!detail) return publicCompany(company);
  if (!key)
    throw new Error("Desbloquea las credenciales una vez para recuperar los campos anteriores.");
  const fields = await Dexie.waitFor(unseal<CompanyDetails>(key, `company:${company.id}`, detail));
  return { ...publicFields, ...fields, detailsPending: false };
}

export async function readCompanies(key?: CryptoKey): Promise<Company[]> {
  if (key) await migrateCompanyDetails(key);
  return (await operationsDb.companies.toArray()).map(publicCompany);
}

async function writeCompany(company: Company): Promise<void> {
  const { detailsPending: _pending, ...values } = company;
  await operationsDb.companies.put(values);
}

/** Credentials keep their encryption; only older company-detail envelopes are opened once. */
export async function migrateCompanyDetails(key: CryptoKey): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, async () => {
    for (const company of await operationsDb.companies.toArray()) {
      if (company.detail) await writeCompany(await companyDetails(company, key));
    }
  });
}

export async function readAccesses(key: CryptoKey): Promise<Access[]> {
  const rows = await operationsDb.accesses.toArray();
  return Promise.all(rows.map((row) => unseal<Access>(key, row.id, row.payload)));
}

export async function createSpace(password: string): Promise<CryptoKey> {
  const { key, config } = await createVault(password);
  await operationsDb.meta.add(config);
  return key;
}

export async function unlockSpace(password: string): Promise<CryptoKey> {
  const config = await operationsDb.meta.get("vault");
  if (!config) throw new Error("Primero crea una contraseña para el espacio de claves.");
  const key = await openVault(password, config);
  await migrateCompanyDetails(key);
  return key;
}

async function readStoredAccess(id: string, key: CryptoKey): Promise<Access> {
  const row = await operationsDb.accesses.get(id);
  if (!row) throw new Error("Este acceso ya no existe.");
  return Dexie.waitFor(unseal<Access>(key, id, row.payload));
}

async function writeAccess(access: Access, key: CryptoKey): Promise<void> {
  const payload = await Dexie.waitFor(seal(key, access.id, access));
  await operationsDb.accesses.put({ id: access.id, companyId: access.companyId, payload });
}

export async function patchAccess(
  id: string,
  patch: Partial<AccessValues>,
  key: CryptoKey,
): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.accesses, async () => {
    const current = await readStoredAccess(id, key);
    await writeAccess({ ...current, edits: { ...current.edits, ...patch } }, key);
  });
}

export async function patchAccessField(
  id: string,
  fieldKey: string,
  value: string,
  key: CryptoKey,
): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.accesses, async () => {
    const current = await readStoredAccess(id, key);
    await writeAccess(
      { ...current, fieldEdits: { ...current.fieldEdits, [fieldKey]: value } },
      key,
    );
  });
}

export async function addAccess(companyId: string, key: CryptoKey): Promise<string> {
  const id = crypto.randomUUID();
  if (!(await operationsDb.companies.get(companyId)))
    throw new Error("Selecciona una empresa existente.");
  const access: Access = {
    id,
    companyId,
    original: { service: "Nuevo servicio", user: "", password: "", email: "", notes: "" },
    edits: {},
    fields: [],
    fieldEdits: {},
  };
  const payload = await seal(key, id, access);
  await operationsDb.accesses.add({ id, companyId, payload });
  return id;
}

export async function deleteAccess(id: string): Promise<void> {
  await operationsDb.accesses.delete(id);
}

export async function addCompany(): Promise<string> {
  const company = newCompany();
  const { fields: _fields, fieldEdits: _edits, ...stored } = company;
  await operationsDb.companies.add(stored);
  return company.id;
}

export async function patchCompany(id: string, patch: Partial<CompanyValues>): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, async () => {
    const current = await operationsDb.companies.get(id);
    if (!current) throw new Error("Esta empresa ya no existe.");
    await operationsDb.companies.update(id, { edits: { ...current.edits, ...patch } });
  });
}

export async function patchCompanyField(
  id: string,
  fieldKey: string,
  value: string,
  key?: CryptoKey,
): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, async () => {
    const current = await operationsDb.companies.get(id);
    if (!current) throw new Error("Esta empresa ya no existe.");
    const company = await companyDetails(current, key);
    await writeCompany({ ...company, fieldEdits: { ...company.fieldEdits, [fieldKey]: value } });
  });
}

export type CompanyFieldAction =
  | { type: "add-tab"; label: string }
  | {
      type: "add-field";
      category: string;
      label: string;
      value: string;
      fieldType?: CompanyFieldType;
    }
  | { type: "move-field"; fieldKey: string; category: string }
  | { type: "remove-field"; fieldKey: string }
  | { type: "configure-field"; fieldKey: string; fieldType: CompanyFieldType };

export async function patchCompanyTax(
  id: string,
  patch: Partial<CompanyTaxValues>,
  key?: CryptoKey,
): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, async () => {
    const stored = await operationsDb.companies.get(id);
    if (!stored) throw new Error("Esta empresa ya no existe.");
    await writeCompany(patchCompanyTaxValues(await companyDetails(stored, key), patch));
  });
}

export async function changeCompanyFields(
  id: string,
  action: CompanyFieldAction,
  key?: CryptoKey,
): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, async () => {
    const stored = await operationsDb.companies.get(id);
    if (!stored) throw new Error("Esta empresa ya no existe.");
    const company = await companyDetails(stored, key);
    const next =
      action.type === "add-tab"
        ? addCompanyTab(company, action.label)
        : action.type === "add-field"
          ? addCompanyCustomField(
              company,
              action.category,
              action.label,
              action.value,
              `manual:${crypto.randomUUID()}`,
              action.fieldType,
            )
          : action.type === "move-field"
            ? moveCompanyField(company, action.fieldKey, action.category)
            : action.type === "configure-field"
              ? configureCompanyField(company, action.fieldKey, action.fieldType)
              : removeCompanyCustomField(company, action.fieldKey);
    await writeCompany(next);
  });
}

export async function deleteCompany(id: string): Promise<void> {
  await operationsDb.transaction(
    "rw",
    operationsDb.companies,
    operationsDb.accesses,
    operationsDb.obligations,
    operationsDb.tasks,
    async () => {
      await operationsDb.accesses.where("companyId").equals(id).delete();
      await operationsDb.obligations.where("companyId").equals(id).delete();
      await operationsDb.tasks.where("companyId").equals(id).delete();
      await operationsDb.companies.delete(id);
    },
  );
}

export async function patchObligation(
  id: string,
  patch: Partial<Pick<Obligation, "applies" | "interpretation" | "notes" | "label">>,
): Promise<void> {
  if (!(await operationsDb.obligations.update(id, patch)))
    throw new Error("Esta obligación ya no existe.");
}

export async function addObligation(companyId: string): Promise<string> {
  const id = crypto.randomUUID();
  if (!(await operationsDb.companies.get(companyId)))
    throw new Error("Selecciona una empresa existente.");
  await operationsDb.obligations.add({
    id,
    companyId,
    category: "Otras obligaciones",
    label: "Nueva obligación",
    applies: null,
    interpretation: "unresolved",
    notes: "",
    source: {
      key: id,
      address: "",
      row: 0,
      column: "",
      category: "Otras obligaciones",
      label: "Nueva obligación",
      original: "",
    },
  });
  return id;
}

export async function deleteObligation(id: string): Promise<void> {
  await operationsDb.obligations.delete(id);
}

export async function addTask(
  companyId: string,
  period: string,
  title = "Nueva tarea",
  initial: Partial<Omit<TaskValues, "period" | "title">> = {},
): Promise<string> {
  const id = crypto.randomUUID();
  if (!validPeriod(period)) throw new Error("El período debe tener año y mes válidos.");
  if (initial.dueOn && !validDate(initial.dueOn)) throw new Error("La fecha no es válida.");
  if (!(await operationsDb.companies.get(companyId)))
    throw new Error("Selecciona una empresa existente.");
  await operationsDb.tasks.add({
    id,
    companyId,
    original: { dueOn: null, person: "", done: false, notes: "", ...initial, title, period },
    edits: {},
  });
  return id;
}

export async function patchTask(id: string, patch: Partial<TaskValues>): Promise<void> {
  if (patch.period !== undefined && !validPeriod(patch.period))
    throw new Error("El período debe tener año y mes válidos.");
  if (patch.dueOn !== undefined && patch.dueOn !== null && !validDate(patch.dueOn))
    throw new Error("La fecha no es válida.");
  await operationsDb.transaction("rw", operationsDb.tasks, async () => {
    const current = await operationsDb.tasks.get(id);
    if (!current) throw new Error("Esta tarea ya no existe.");
    await operationsDb.tasks.update(id, { edits: { ...current.edits, ...patch } });
  });
}

export async function deleteTask(id: string): Promise<void> {
  await operationsDb.tasks.delete(id);
}

async function mergeCompanies(incoming: Company[], key: CryptoKey): Promise<void> {
  for (const company of incoming) {
    const stored = await operationsDb.companies.get(company.id);
    const current = stored ? await companyDetails(stored, key) : undefined;
    const next = mergeCompanyDetails(current, company);
    await writeCompany(next);
  }
}

export async function importKeys(
  incoming: KeysImport,
  key: CryptoKey,
  filename = "CLAVES",
): Promise<void> {
  validateKeysImport(incoming);
  const sourceId = crypto.randomUUID();
  const payload = await seal(key, sourceId, incoming.source);
  await operationsDb.transaction(
    "rw",
    [
      operationsDb.companies,
      operationsDb.accesses,
      operationsDb.obligations,
      operationsDb.tasks,
      operationsDb.sources,
    ],
    async () => {
      await mergeCompanies(incoming.companies, key);
      for (const access of incoming.accesses) {
        const row = await operationsDb.accesses.get(access.id);
        const current = row
          ? await Dexie.waitFor(unseal<Access>(key, access.id, row.payload))
          : undefined;
        const next = mergeImported(current, access);
        next.fieldEdits = { ...access.fieldEdits, ...current?.fieldEdits };
        await writeAccess(next, key);
      }
      for (const obligation of incoming.obligations) {
        const current = await operationsDb.obligations.get(obligation.id);
        await operationsDb.obligations.put(
          current
            ? {
                ...obligation,
                label: current.label,
                applies: current.applies,
                interpretation: current.interpretation,
                notes: current.notes,
              }
            : obligation,
        );
      }
      const tasks = mergeObligationTasks(
        await operationsDb.obligations
          .bulkGet(incoming.obligations.map((o) => o.id))
          .then((rows) => rows.filter((o): o is Obligation => !!o)),
        await operationsDb.tasks.toArray(),
      );
      if (tasks.length) await operationsDb.tasks.bulkPut(tasks);
      await operationsDb.sources.add({
        id: sourceId,
        name: filename,
        loadedOn: new Date().toISOString(),
        payload,
      });
    },
  );
}

export async function importSchedule(incoming: ScheduleImport): Promise<void> {
  await operationsDb.transaction("rw", operationsDb.companies, operationsDb.tasks, async () => {
    // A schedule adds companies, but never replaces their richer keys-workbook fields.
    for (const company of incoming.companies)
      if (!(await operationsDb.companies.get(company.id))) {
        const { fields: _fields, fieldEdits: _edits, ...stored } = company;
        await operationsDb.companies.put(stored);
      }
    for (const task of incoming.tasks) {
      const current = await operationsDb.tasks.get(task.id);
      const merged = mergeImported(current, task);
      if (current?.sourceObligationId) merged.sourceObligationId = current.sourceObligationId;
      await operationsDb.tasks.put(merged);
    }
  });
}

export async function readLatestSource(key: CryptoKey): Promise<SourceSnapshot | null> {
  const row = await operationsDb.sources.orderBy("loadedOn").last();
  return row ? unseal<SourceSnapshot>(key, row.id, row.payload) : null;
}
