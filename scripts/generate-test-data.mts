/**
 * Generates PyG's test data set under `.context/generated/`, so the app can be driven with Playwright
 * without depending on the real client files that live in `.context/`.
 *
 * It covers the four upload formats registered in `lib/profit-loss/upload/` — monthly by cost
 * centers, monthly single statement, MicroPlus and Dingoo — for each of the three lines of business
 * in `test-data/rubros.mts` and for each of the three years, with all twelve months filled.
 *
 * The axis that makes the set useful: for one same (line, year, month) the four systems emit THE SAME
 * numbers. Each writes them its own way — MicroPlus stores the expense negative, Dingoo the revenue,
 * and both number the accounts with two-digit segments — so a test that loads the same month in two
 * systems and gets the same profit is testing the strategy's normalization and nothing else. The
 * `GENERAL` column of the by-centers format is, by construction, exactly the single statement's value
 * for the same month.
 *
 * Deterministic: the values come from a PRNG seeded with the (line, year, month, account) itself, with
 * no `Math.random` and no dates, so regenerating produces the same bytes and a test can pin figures.
 *
 * Run with `pnpm gen:testdata`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { CLINICA_2026 } from "./test-data/clinica-2026.mts";
import { RUBROS, type AccountSpec, type Rubro } from "./test-data/rubros.mts";

type Cell = string | number | null;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, ".context", "generated");
const YEARS = [2024, 2025, 2026];
/** The last column of the by-centers format; the contract reads it by POSITION, always at the end. */
const SIN_CENTRO = "SIN CENTRO DE COSTO";

// ─────────────────────────────────────────────────────────────────────────────
// A PRNG seeded by string — determinism with no `Math.random`.
// ─────────────────────────────────────────────────────────────────────────────

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 over the seed's hash: [0, 1). */
function rand(seed: string): number {
  let t = (hashString(seed) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randRange(seed: string, min: number, max: number): number {
  return min + rand(seed) * (max - min);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// The chart of accounts, flattened and numbered by position.
// ─────────────────────────────────────────────────────────────────────────────

interface FlatAccount {
  /** Numeric segments, unformatted: `[4, 1, 1, 1, 1]`. */
  path: number[];
  key: string;
  /** The parent by NESTING, which is not always the code minus its last segment — see `segment`.
   * `undefined` in the two roots. */
  parentKey: string | undefined;
  name: string;
  level: number;
  root: "4" | "5";
  isLeaf: boolean;
  /** Leaves only; the parents are recomputed by summing. */
  weight: number;
}

/**
 * The segments an account adds to its parent's code: its POSITION among the siblings, unless the plan
 * declares otherwise (`segment`). Several segments are a level the report SKIPS, like the `4.1.01.01`
 * that hangs directly off `4.1` in the clinic's plan.
 */
function segmentsOf(spec: AccountSpec, position: number): number[] {
  if (spec.segment === undefined) {
    return [position];
  }
  return Array.isArray(spec.segment) ? [...spec.segment] : [spec.segment];
}

function flatten(spec: AccountSpec, path: number[], out: FlatAccount[], parentKey?: string): void {
  const isLeaf = !spec.children?.length;
  const key = path.join(".");
  out.push({
    path: [...path],
    key,
    parentKey,
    name: spec.name,
    level: path.length,
    root: String(path[0]) as "4" | "5",
    isLeaf,
    weight: isLeaf ? (spec.weight ?? 1) : 0,
  });
  spec.children?.forEach((child, index) =>
    flatten(child, [...path, ...segmentsOf(child, index + 1)], out, key),
  );
}

function accountsOf(rubro: Rubro): FlatAccount[] {
  const out: FlatAccount[] = [];
  flatten(rubro.income, [4], out);
  flatten(rubro.expense, [5], out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Codes: one same `path`, three conventions.
// ─────────────────────────────────────────────────────────────────────────────

type SystemId = "centros" | "unitario" | "microplus" | "dingoo";

/**
 * `4.1.1.1.1` in the app's own formats; `4.1.01.01.01` in MicroPlus (two digits from the third
 * segment) and `4.01.01.02` in Dingoo (two digits from the second). The three conventions are
 * incompatible with each other on purpose: it is what makes the system part of the workspace's
 * identity.
 */
function formatCode(path: number[], system: SystemId): string {
  const padFrom = system === "microplus" ? 2 : system === "dingoo" ? 1 : Infinity;
  return path
    .map((segment, index) =>
      index >= padFrom ? String(segment).padStart(2, "0") : String(segment),
    )
    .join(".");
}

// ─────────────────────────────────────────────────────────────────────────────
// The month's values.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The month's revenue and expense. The expense is a FIXED part plus a proportion of the sales, so in
 * low season there are months at a loss and in high season at a profit without any figure being set
 * by hand — it is what gives something to look at in Gráficos and in Análisis.
 */
function monthlyTotals(
  rubro: Rubro,
  year: number,
  month: number,
): { income: number; expense: number } {
  const growth = rubro.growth ** YEARS.indexOf(year);
  const income =
    rubro.baseIncome *
    rubro.season[month] *
    growth *
    randRange(`${rubro.slug}|${year}|${month}|ingreso`, 0.92, 1.08);
  const expense =
    (rubro.baseIncome * growth * rubro.fixedRatio + income * rubro.variableRatio) *
    randRange(`${rubro.slug}|${year}|${month}|gasto`, 0.94, 1.06);
  return { income, expense };
}

/** Each LEAF's value for the month, splitting its root's total by weights with noise. */
function leafValues(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
): Map<string, number> {
  const totals = monthlyTotals(rubro, year, month);
  const values = new Map<string, number>();

  for (const root of ["4", "5"] as const) {
    const total = root === "4" ? totals.income : totals.expense;
    const leaves = accounts.filter((account) => account.isLeaf && account.root === root);
    const weighted = leaves.map((account) => ({
      account,
      weight:
        account.weight === 0
          ? 0
          : account.weight * randRange(`${rubro.slug}|${year}|${month}|${account.key}`, 0.8, 1.2),
    }));
    const sum = weighted.reduce((acc, item) => acc + item.weight, 0) || 1;
    for (const { account, weight } of weighted) {
      values.set(account.key, round2((total * weight) / sum));
    }
  }
  return values;
}

/**
 * The REAL figures a (line, year) has transcribed, which replace the synthetic ones — only in
 * MICROPLUS, which is the system they came from. The other three keep taking that same year from the
 * PRNG, so for that pair the set's axis («the four systems give the same figures») is deliberately
 * broken: what is gained in exchange is a file that reproduces the firm's annex, and the README says
 * so.
 */
const TRANSCRITAS: Record<string, Record<number, Record<string, number[]>>> = {
  "rubro-c-clinica": { 2026: CLINICA_2026 },
};

/**
 * The month's leaves taken from a transcription, in the generator's convention: the table arrives
 * VERBATIM from the report —the expense negative— and here is where it is turned the right way round,
 * just once. A leaf the table does not name is worth 0, and a key that is not a leaf of THIS plan is
 * an error: a mistyped code would otherwise pass as «that account did not move», with no figure giving
 * it away.
 */
function transcribedLeafValues(
  accounts: FlatAccount[],
  table: Record<string, number[]>,
  month: number,
): Map<string, number> {
  const byCode = new Map(
    accounts
      .filter((account) => account.isLeaf)
      .map((account) => [formatCode(account.path, "microplus"), account] as const),
  );
  for (const code of Object.keys(table)) {
    if (!byCode.has(code)) {
      throw new Error(`Transcripción: ${code} no es una cuenta de movimiento de este plan.`);
    }
  }
  const values = new Map<string, number>();
  for (const [code, account] of byCode) {
    const amount = table[code]?.[month] ?? 0;
    values.set(account.key, account.root === "5" ? -amount : amount);
  }
  return values;
}

/** What MicroPlus writes that month: the transcription if the (line, year) has one, and otherwise the
 *  PRNG. */
function microplusLeafValues(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
): Map<string, number> {
  const table = TRANSCRITAS[rubro.slug]?.[year];
  return table === undefined
    ? leafValues(rubro, accounts, year, month)
    : transcribedLeafValues(accounts, table, month);
}

/** The parents, summing children from the bottom up. They are never declared: they are derived. */
function rollup(accounts: FlatAccount[], leaves: Map<string, number>): Map<string, number> {
  const values = new Map(leaves);
  const childrenOf = new Map<string, string[]>();
  for (const account of accounts) {
    // By the NESTING parent and not by the code minus its last segment: a plan can skip a level
    // (`4.1.01.01` hangs off `4.1`), and there the parent by code does not exist and its branch would
    // be left unsummed.
    const parent = account.parentKey;
    if (parent === undefined) {
      continue;
    }
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), account.key]);
  }
  for (const account of [...accounts].sort((a, b) => b.level - a.level)) {
    if (account.isLeaf) {
      continue;
    }
    const sum = (childrenOf.get(account.key) ?? []).reduce(
      (acc, key) => acc + (values.get(key) ?? 0),
      0,
    );
    values.set(account.key, round2(sum));
  }
  return values;
}

function rootTotal(values: Map<string, number>, root: "4" | "5"): number {
  return round2(values.get(root) ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Split by cost center (only in «centers» mode).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A center's weight over a leaf. Stable in time (the seed does not carry the month), because a center
 * that changed its mix every month would not resemble any real hotel. 18% of the branches are left at
 * zero for a given center: without that the columns would be scaled copies of each other and any chart
 * comparing them would say the same thing.
 */
function centerWeight(rubro: Rubro, leaf: FlatAccount, center: string): number {
  if (center === SIN_CENTRO) {
    return rand(`${rubro.slug}|sin-centro|${leaf.key}`) < 0.15
      ? randRange(`${rubro.slug}|sin-centro-peso|${leaf.key}`, 0.02, 0.1)
      : 0;
  }
  const branch = leaf.path.slice(0, 3).join(".");
  if (rand(`${rubro.slug}|${center}|rama|${branch}`) < 0.18) {
    return 0;
  }
  return (
    randRange(`${rubro.slug}|${center}|escala`, 0.5, 1.6) *
    randRange(`${rubro.slug}|${center}|${leaf.key}`, 0.2, 1.4)
  );
}

/**
 * Splits a leaf's value across the centers. The last center with weight absorbs the rounding, so that
 * Σ centers is EXACTLY the leaf's value: that way `GENERAL` squares to the cent (which is what
 * `merge-month.ts` checks) and matches what the single statement of the same month brings.
 */
function splitAcrossCenters(
  rubro: Rubro,
  leaf: FlatAccount,
  value: number,
  centers: string[],
): number[] {
  const weights = centers.map((center) => centerWeight(rubro, leaf, center));
  // No leaf is left without a center: if chance switched off all its branches, the first column takes
  // the whole value, and that way `GENERAL` is still exactly the account's value.
  if (!weights.some((weight) => weight > 0)) {
    weights[0] = 1;
  }
  if (value === 0) {
    return centers.map(() => 0);
  }
  const total = weights.reduce((acc, weight) => acc + weight, 0);
  const values = weights.map((weight) => round2((value * weight) / total));
  const lastWeighted = weights.reduce((last, weight, index) => (weight > 0 ? index : last), 0);
  values[lastWeighted] = round2(
    values[lastWeighted] + (value - values.reduce((acc, item) => acc + item, 0)),
  );
  return values;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura de libros.
// ─────────────────────────────────────────────────────────────────────────────

function writeWorkbook(
  rows: Cell[][],
  sheetName: string,
  file: string,
  startAtColumnB = false,
): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (startAtColumnB && sheet["!ref"]) {
    // The real Dingoo and MicroPlus exports open their range in column B, and `readGrid` reindexes
    // from the range: the grid's index 0 is the file's column B. Reproducing it is what makes the set
    // useful for testing that the strategy locates by label and not by coordinate — one copied from
    // what is seen on opening the file would read another column.
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    range.s.c = 1;
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Excel's date serial (days since 30/12/1899), which is how MicroPlus' sample stores its printing
 * date. */
function excelSerial(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function dmy(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year}`;
}

function mm(month: number): string {
  return String(month + 1).padStart(2, "0");
}

/**
 * The VERBATIM name, exactly as the plan declares it — not one transformation.
 *
 * A real export's parents go in capitals, and this used to force them here. But MicroPlus' real plan
 * shows that the capitals belong to the PLAN and not to the report: its parent accounts are capitals
 * except for the closing parenthesis of six of them —`SEGUROS Y REASEGUROS (Primas y Cesiones)`,
 * `APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res`—, which a report that transformed them would
 * have flattened all the same. Forcing them here made it impossible to transcribe a plan as it is,
 * which is exactly what the clinic's line of business needs; the synthetic plans declare their parents
 * in capitals and come out just as before.
 */
function systemName(account: FlatAccount): string {
  return account.name;
}

// ── Monthly by cost centers ─────────────────────────────────────────────────

function writeCentros(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
  dir: string,
): void {
  const centers = [...rubro.centers, SIN_CENTRO];
  const general = rollup(accounts, leafValues(rubro, accounts, year, month));

  const perCenterLeaves = centers.map(() => new Map<string, number>());
  for (const account of accounts) {
    if (!account.isLeaf) {
      continue;
    }
    const split = splitAcrossCenters(rubro, account, general.get(account.key) ?? 0, centers);
    split.forEach((value, index) => perCenterLeaves[index].set(account.key, value));
  }
  const perCenter = perCenterLeaves.map((leaves) => rollup(accounts, leaves));

  const rows: Cell[][] = [
    [rubro.company],
    ["Estado de Resultados"],
    [],
    [null, null, "GENERAL", ...centers],
  ];
  for (const account of accounts) {
    rows.push([
      formatCode(account.path, "centros"),
      account.name,
      general.get(account.key) ?? 0,
      ...perCenter.map((values) => values.get(account.key) ?? 0),
    ]);
  }
  const resultOf = (values: Map<string, number>): number =>
    round2(rootTotal(values, "4") - rootTotal(values, "5"));
  rows.push([
    null,
    "Utilidad o Perdida",
    resultOf(general),
    ...perCenter.map((values) => resultOf(values)),
  ]);

  // The by-centers format does not declare its period: the file's NAME declares it.
  writeWorkbook(rows, "Reporte", join(dir, `PyG-${year}-${mm(month)}.xlsx`));
}

// ── Monthly single statement ────────────────────────────────────────────────

function writeUnitario(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
  dir: string,
): void {
  const values = rollup(accounts, leafValues(rubro, accounts, year, month));
  const rows: Cell[][] = [
    [rubro.company],
    ["Estado de Resultados"],
    [`Desde el ${dmy(1, month, year)} hasta el ${dmy(lastDayOfMonth(year, month), month, year)}`],
    [],
    [],
    [null, null, "Total"],
    [],
  ];
  for (const account of accounts) {
    rows.push([formatCode(account.path, "unitario"), account.name, values.get(account.key) ?? 0]);
  }
  rows.push([null, "Utilidad o Pérdida", round2(rootTotal(values, "4") - rootTotal(values, "5"))]);

  // The name is free on purpose: this format declares its own period inside the file.
  writeWorkbook(rows, "Consulta Personas", join(dir, `EstadoResultados-${year}-${mm(month)}.xlsx`));
}

// ── MicroPlus ───────────────────────────────────────────────────────────────

/**
 * The value's column ENCODES the depth (the report indents to the right); `SALDO`, in column 18,
 * labels none of them. Measured over the 215 accounts of `.context/microplus/mayo.xls` — it depends on
 * the LEVEL and nothing else: a level-5 account values in column 16 whether it is a leaf or a parent.
 */
const MICROPLUS_VALUE_COL: Record<number, number> = { 1: 23, 2: 22, 3: 19, 4: 17, 5: 16, 6: 14 };
/** From level 6 on the sample stops shifting: its levels 6 and 7 value in the same one. */
const MICROPLUS_DEEPEST_VALUE_COL = 14;
const MICROPLUS_WIDTH = 28;

/**
 * A MicroPlus row, declared by the columns of the GRID the parser sees. The real sample opens its
 * range in column B, so the grid runs one position off from the file: `writeWorkbook` trims the range
 * and this function leaves column A empty to compensate for it.
 */
function sparseRow(entries: Record<number, Cell>): Cell[] {
  const row: Cell[] = Array.from({ length: MICROPLUS_WIDTH + 1 }, () => null);
  for (const [col, value] of Object.entries(entries)) {
    row[Number(col) + 1] = value;
  }
  return row;
}

/** MicroPlus writes its figures as TEXT with a thousands separator. `|| 0` normalizes the `-0` that
 * inverting an account at zero leaves: numerically it makes no difference, but nobody writes
 * `-0.00`. */
function microplusAmount(value: number): string {
  return (value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function writeMicroplus(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
  dir: string,
): void {
  const values = rollup(accounts, microplusLeafValues(rubro, accounts, year, month));
  const rows: Cell[][] = [
    sparseRow({}),
    sparseRow({ 3: rubro.company, 23: "Página:", 26: "1 de 1" }),
    sparseRow({}),
    sparseRow({
      3: "BALANCE DE PERDIDAS Y GANANCIAS",
      23: "Fecha:",
      // The PRINTING date, and it goes as an Excel serial just as in the sample. It is not the period,
      // and `microplus-grid.ts` skips it along with the pagination — having it here is precisely what
      // proves it skips it.
      26: excelSerial(year, month, lastDayOfMonth(year, month)),
    }),
    sparseRow({}),
    sparseRow({
      3: "Desde:",
      5: dmy(1, month, year),
      9: "Hasta:",
      10: dmy(lastDayOfMonth(year, month), month, year),
    }),
    sparseRow({}),
    sparseRow({ 1: "CODIGO", 7: "NOMBRE DE LA CUENTA", 18: "SALDO" }),
    sparseRow({}),
  ];

  for (const account of accounts) {
    // MicroPlus stores the expense NEGATIVE and adds (`RESULTADO = 4 + 5`); the app stores it positive
    // and subtracts, so branch 5 comes out inverted from the generator and `microplus.ts` inverts it
    // again on import.
    const value = (values.get(account.key) ?? 0) * (account.root === "5" ? -1 : 1);
    rows.push(
      sparseRow({
        // The trailing dot marks a parent account — the app uses it only as a cross-check of the tree.
        1: formatCode(account.path, "microplus") + (account.isLeaf ? "" : "."),
        // The report indents by level and sends the leaves to the bottom, just like the real sample.
        7: " ".repeat(account.isLeaf ? 10 : account.level) + systemName(account),
        [MICROPLUS_VALUE_COL[account.level] ?? MICROPLUS_DEEPEST_VALUE_COL]: microplusAmount(value),
      }),
      sparseRow({}),
      sparseRow({}),
    );
  }

  const result = round2(rootTotal(values, "4") - rootTotal(values, "5"));
  rows.push(
    sparseRow({ 0: "RESULTADO:", 21: result }),
    sparseRow({}),
    sparseRow({ 2: "Presidente", 11: "Gerente", 21: "Contador" }),
  );

  writeWorkbook(rows, "Sheet1", join(dir, `BalancePyG-${year}-${mm(month)}.xlsx`), true);
}

// ── Dingoo ──────────────────────────────────────────────────────────────────

function writeDingoo(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
  dir: string,
): void {
  const values = rollup(accounts, leafValues(rubro, accounts, year, month));
  const blank = (): Cell[] => [];
  const rows: Cell[][] = [
    blank(),
    [null, null, null, null, "REPORTE"],
    [null, null, null, null, "ESTADO DE RESULTADOS"],
    // Razón social and nombre comercial, which in the real export differ only in the trailing dot:
    // `findDingooCompany` keeps the FIRST, and that stability is what is being tested.
    [null, null, null, null, rubro.company],
    [null, null, null, null, rubro.company.replace(/\.$/, "")],
    [null, null, null, null, rubro.address],
    [null, null, null, null, rubro.ruc],
    blank(),
    blank(),
    blank(),
    blank(),
    [
      null,
      `Desde el ${dmy(1, month, year)} al ${dmy(lastDayOfMonth(year, month), month, year)}. Estado: Aprobados`,
    ],
    blank(),
    [null, "Código", "", "Nombre de la cuenta", "", "", "", "Saldo", "", ""],
  ];

  for (const account of accounts) {
    // Dingoo stores REVENUE negative and adds; an exact mirror of MicroPlus, which inverts branch 5.
    const value = (values.get(account.key) ?? 0) * (account.root === "4" ? -1 : 1) || 0;
    rows.push([
      null,
      formatCode(account.path, "dingoo"),
      null,
      systemName(account),
      null,
      null,
      null,
      value,
      null,
      null,
    ]);
  }

  const result = round2(rootTotal(values, "5") - rootTotal(values, "4"));
  rows.push(blank(), blank(), [
    null,
    null,
    null,
    null,
    null,
    "Resultado del ejercicio (Utilidad o pérdida): ",
    null,
    result,
    "",
    "",
  ]);

  writeWorkbook(
    rows,
    "RptEstadoResultados",
    join(dir, `RptEstadoResultados-${year}-${mm(month)}.xlsx`),
    true,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest: what a test can assert without opening the .xlsx files again.
// ─────────────────────────────────────────────────────────────────────────────

interface RubroManifest {
  slug: string;
  empresa: string;
  ruc: string;
  centros: string[];
  cuentas: number;
  hojas: number;
  profundidadMaxima: number;
  /** Per year: the twelve months and the accumulated figure, in the app's convention (4 adds, 5
   *  subtracts). */
  anios: Record<string, YearManifest & { microplus?: YearManifest }>;
}

interface YearManifest {
  meses: { mes: number; ingresos: number; gastos: number; utilidad: number }[];
  total: { ingresos: number; gastos: number; utilidad: number };
}

/** A year's twelve months, summarised, from whoever decides each leaf's value. */
function yearManifest(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  leavesOf: (month: number) => Map<string, number>,
): YearManifest {
  const meses = Array.from({ length: 12 }, (_, month) => {
    const values = rollup(accounts, leavesOf(month));
    const ingresos = rootTotal(values, "4");
    const gastos = rootTotal(values, "5");
    return { mes: month + 1, ingresos, gastos, utilidad: round2(ingresos - gastos) };
  });
  const sum = (pick: (m: (typeof meses)[number]) => number): number =>
    round2(meses.reduce((acc, item) => acc + pick(item), 0));
  return {
    meses,
    total: {
      ingresos: sum((m) => m.ingresos),
      gastos: sum((m) => m.gastos),
      utilidad: sum((m) => m.utilidad),
    },
  };
}

function buildManifest(rubro: Rubro, accounts: FlatAccount[]): RubroManifest {
  const anios: RubroManifest["anios"] = {};
  for (const year of YEARS) {
    anios[String(year)] = {
      ...yearManifest(rubro, accounts, year, (month) => leafValues(rubro, accounts, year, month)),
      // The year MicroPlus brings transcribed does not square with that of the other three systems, so
      // it comes out SEPARATELY instead of replacing the one above: a test that pins figures has to be
      // able to say which file it is talking about.
      ...(TRANSCRITAS[rubro.slug]?.[year] === undefined
        ? {}
        : {
            microplus: yearManifest(rubro, accounts, year, (month) =>
              microplusLeafValues(rubro, accounts, year, month),
            ),
          }),
    };
  }
  return {
    slug: rubro.slug,
    empresa: rubro.company,
    ruc: rubro.ruc,
    centros: [...rubro.centers, SIN_CENTRO],
    cuentas: accounts.length,
    hojas: accounts.filter((account) => account.isLeaf).length,
    profundidadMaxima: Math.max(...accounts.map((account) => account.level)),
    anios,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/** The README travels with the files and is rewritten with them: if something changes in the
 * generator, the description cannot be left describing the previous version. */
function readme(manifests: RubroManifest[]): string {
  const rows = manifests
    .map(
      (item) =>
        `| \`${item.slug}\` | ${item.empresa} | ${item.profundidadMaxima} | ${item.cuentas} (${item.hojas} de movimiento) | ${item.centros.length} |`,
    )
    .join("\n");

  return `# Datos de prueba de PyG

Generado por \`pnpm gen:testdata\` (\`scripts/generate-test-data.mts\`). **No editar a mano**: el
script borra y reescribe esta carpeta entera. Las empresas son inventadas y las cifras también,
con UNA excepción declarada: la clínica en MicroPlus 2026 lleva las de un cliente real (ver abajo).

## Qué hay

\`<rubro>/<sistema>/<año>/<archivo>.xlsx\` — ${manifests.length} rubros × 4 sistemas ×
${YEARS.length} años (${YEARS.join(", ")}) × 12 meses = **${manifests.length * 4 * YEARS.length * 12} archivos**,
con todos los meses llenos.

| Rubro | Empresa | Profundidad | Cuentas | Columnas de centro |
| --- | --- | --- | --- | --- |
${rows}

Cada rubro tiene su PROPIO plan de cuentas — otros nombres, otra profundidad, otras ramas — pero
siempre colgando de \`4\` (ingresos) y \`5\` (costos y gastos), y siempre con una rama \`5.2\` para
poder probar «Segmentar gastos».

El de la **clínica** es el único que no se inventó: es el plan real de MicroPlus, transcrito con sus
códigos y sus nombres. Es el que trae los diecisiete rubros que el predeterminado «Costos y gastos»
reparte —sin un archivo con ESOS códigos esa vista no se puede abrir—, y sus pesos reproducen las
proporciones del anexo de la firma: 27 % honorarios médicos, 15 % medicinas e insumos, 14 % nómina
administrativa. Las doce ramas que su plan declara y nunca mueve (\`5.2.03\`, \`5.2.04\`,
\`5.3.03.02\`, \`.05\`, \`.08\`, \`.10\`, \`.15\`, \`.16\`, \`.18\`, \`.20\`…) son deliberadas: son las
que hacen que, **en los años sintéticos**, los diecisiete sumen el gasto entero y su «Otros» salga
en cero.

**Y su 2026 en MicroPlus lleva además las CIFRAS reales** (\`scripts/test-data/clinica-2026.mts\`,
transcritas del \`BALANCE DE PERDIDAS Y GANANCIAS AL 30-06-2026\` de ese cliente), porque el anexo
que la firma revisa no se puede reproducir con números inventados: ahí están los 307.005,37 de
honorarios médicos y los 94.886,27 de otros gastos operacionales que \`expense-distribution.test.ts\`
fija. La hoja llega hasta junio, así que **julio a diciembre salen en cero** — meses cargados y
vacíos, que no es lo mismo que meses sin cargar. Con esas cifras el año se lee distinto y a
propósito: cierra en rojo febrero, mayo y junio, y los diecisiete rubros ya NO suman el gasto entero
(quedan 170.923,51 en «Otros», que es lo que este cliente mueve en \`5.2.04\`, \`5.2.05\` y
\`5.3.03.16\` menos su descuento en compras). Los otros tres sistemas de ese mismo año siguen
sintéticos.

| Carpeta | Estrategia | Modo | Nombre de archivo | Periodo declarado en |
| --- | --- | --- | --- | --- |
| \`centros/\` | \`monthly-centers\` | centros | \`PyG-AAAA-MM.xlsx\` | el nombre del archivo |
| \`unitario/\` | \`monthly-single\` | único | \`EstadoResultados-AAAA-MM.xlsx\` | \`Desde el … hasta el …\` |
| \`microplus/\` | \`microplus\` | único | \`BalancePyG-AAAA-MM.xlsx\` | \`Desde:\` / \`Hasta:\` |
| \`dingoo/\` | \`dingoo\` | único | \`RptEstadoResultados-AAAA-MM.xlsx\` | \`Desde el … al …\` |

## Lo que el set permite afirmar

- **Los cuatro sistemas dan las mismas cifras** para un mismo (rubro, año, mes). Cada uno las
  escribe a su manera: MicroPlus guarda el gasto en negativo, Dingoo el ingreso, y los dos numeran
  con segmentos de dos dígitos (\`4.1.01.01\`, \`4.01.01\`) frente al \`4.1.1.1\` de los formatos
  propios. Cargar el mismo mes en dos sistemas y obtener la misma utilidad prueba la normalización.
  **La excepción es la clínica en 2026**, donde MicroPlus lleva las cifras reales y los otros tres
  las sintéticas; \`manifest.json\` saca ese año en dos bloques (\`meses\` y \`microplus\`) para que
  un test pueda decir de qué archivo habla.
- **\`GENERAL\` = el estado único del mismo mes**, cuenta por cuenta y al céntimo, y cuadra contra
  la suma de sus centros (que es lo que revisa \`merge-month.ts\`).
- **Ningún archivo produce avisos** al cargarse: ni descuadre, ni cuenta huérfana, ni marcador de
  padre contradictorio. Un aviso en un test es un hallazgo, no ruido del set. La ÚNICA excepción es
  el plan de la clínica, que se salta el nivel \`4.1.0X\` —\`4.1.01.01\` cuelga directamente de
  \`4.1\`— y produce por eso cuatro avisos de anidamiento en los tres formatos que leen el árbol por
  código (unitario, MicroPlus y Dingoo). Son los mismos que produce el archivo real: el salto está
  en el plan, no en el generador.
- **Hay meses en pérdida y meses en utilidad**: el gasto tiene una parte fija, así que la
  temporada baja se hunde sola. Hoteles y restaurante cierran algún mes en rojo; la clínica solo en
  su 2026 de MicroPlus, donde las cifras son las reales.
- **Cambiar de rubro, de año o de sistema cambia la identidad del workspace**
  \`(sistema, empresa, año, modo)\`, así que sirve para probar la confirmación de reemplazo.
- **\`manifest.json\`** trae, por rubro y año, los doce meses con \`ingresos\` / \`gastos\` /
  \`utilidad\` ya calculados en la convención de la app (4 suma, 5 resta) — para fijar cifras en un
  test sin volver a abrir los \`.xlsx\`.

## Detalles reproducidos de los formatos reales

- El libro de Dingoo empieza su rango en la **columna B**, y su preámbulo abre con \`REPORTE\` /
  \`ESTADO DE RESULTADOS\` antes de la empresa.
- MicroPlus reparte su preámbulo por celdas sueltas, escribe las cifras como **texto con separador
  de miles**, pone el **punto final** en el código de las cuentas padre y mueve la columna del valor
  según la profundidad (\`SALDO\` solo rotula la del nivel 3).
- El formato por centros **no declara periodo**: lo declara el nombre del archivo.
- El reporte de **ventas por servicio** (solo la clínica, bajo \`ventas/\`) reparte su preámbulo por
  celdas sueltas, escribe \`Desde:\` / \`Hasta:\` en celdas separadas de su rótulo, **repite la
  cabecera en cada página** con su pie \`Pagina:\`, abre cada servicio con su \`\\NN\` y cierra con el
  subtotal de cada uno y un \`TOTAL GENERAL\`. Las cifras van como texto con separador de miles.
  Su total NO es el ingreso del estado del mismo mes, sino ese ingreso ±4 %: **lo facturado no es
  lo contabilizado**, y un set donde coincidieran enseñaría lo contrario de lo que la app declara.
- Los planes traen hojas a distinta profundidad, cadenas de un solo hijo, cuentas de contrapartida
  en negativo, cuentas que existen pero nunca se mueven, códigos SALTADOS (\`5.3\` cuelga \`5.3.02\` y
  \`5.3.03\`, sin \`5.3.01\`) y un nivel que el informe se salta entero.
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ventas por servicio — the BILLING report, which is not the estado de resultados.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The real report's five services, with their verbatim code and the weight they split the month's
 * billing by. The weights are those of the clinic's real April (46.7 % / 14.5 % / 13.5 % / 12.7 % /
 * 12.6 %), so the set shows the same shape the firm recognises.
 */
const SERVICIOS: { code: string; name: string; weight: number }[] = [
  { code: "\\01", name: "HONORARIOS", weight: 0.467 },
  { code: "\\02", name: "MEDICINAS", weight: 0.145 },
  { code: "\\03", name: "EXAMENES DE LABORATORIO", weight: 0.135 },
  { code: "\\04", name: "INSUMOS", weight: 0.127 },
  { code: "\\05", name: "IMAGENES", weight: 0.126 },
];

/** Insurers: INVENTED names with the shape of the real ones (one word, or two with a trade marker),
 *  which is what `lib/sales/payer.ts`'s heuristic has to recognise. */
const ASEGURADORAS = [
  "SALUDVIDA",
  "BMI IGUALAS MEDICAS",
  "MEDIANDES HUMANA",
  "PLAN VITAL",
  "CONFIAMED",
  "SEGUROS DEL PACIFICO",
  "ECUASALUD S.A.",
  "PREPAGADA ANDINA",
];

/** Surnames and given names to compose INDIVIDUAL payers with the Ecuadorian shape —two surnames and
 *  two given names—, which is the one the heuristic classifies as a person. Invented: a versioned
 *  file is no place for a patient's name. */
const APELLIDOS = [
  "MENDOZA",
  "PARRA",
  "VILLACIS",
  "ANDRADE",
  "ZAMBRANO",
  "CEDENO",
  "LOOR",
  "PONCE",
];
const NOMBRES = [
  "LUIS ALBERTO",
  "MARIA JOSE",
  "JUAN CARLOS",
  "ANA LUCIA",
  "PEDRO ANDRES",
  "SOFIA ELENA",
];

/**
 * How many DIFFERENT payers a month sees. It varies by (line, year, month) so the set is not twelve
 * copies of the same size: what has to be testable is that the concentration card counts its tail
 * right —«the ten largest are N %»— with lists of different sizes, and that the number of payers is
 * not confused with the number of lines.
 */
function pagadoresDelMes(rubro: Rubro, year: number, month: number): number {
  return 40 + Math.floor(rand(`${rubro.slug}|${year}|${month}|pagadores`) * 80);
}

/**
 * What fraction of those payers used ONE service. Not everybody buys everything —in the real file
 * there are 2,774 lines for 956 payers, that is, some three services per payer—, and this is what
 * makes a month's lines not be payers × services and two months bring a different number of rows.
 */
function cobertura(rubro: Rubro, year: number, month: number, code: string): number {
  return 0.3 + rand(`${rubro.slug}|${year}|${month}|${code}|cobertura`) * 0.6;
}

/**
 * A catalogue service that did NOT move this month: it comes out with a ZERO amount on a single
 * payer, which is how an accounting system declares a line with no sale. It exists so the set
 * exercises the «N catalogue services did not move in the period and are not drawn» notice, which
 * otherwise would never fire — a service that is absent altogether cannot be counted.
 */
function servicioParado(rubro: Rubro, year: number, month: number): string | null {
  return rand(`${rubro.slug}|${year}|${month}|parado`) < 0.25
    ? SERVICIOS[SERVICIOS.length - 1].code
    : null;
}

function pagadorAt(index: number): string {
  if (index < ASEGURADORAS.length) {
    return ASEGURADORAS[index];
  }
  const offset = index - ASEGURADORAS.length;
  // The three components vary on DIFFERENT scales —units, eights, sixty-fours— so each index gives a
  // different name. With all three taking `offset` on the same scale, the pair of surnames was
  // determined by `offset % 8` and sixty payers collapsed into thirty-two: the tail the concentration
  // card counts disappeared by half.
  const apellido1 = APELLIDOS[offset % APELLIDOS.length];
  const apellido2 = APELLIDOS[Math.floor(offset / APELLIDOS.length) % APELLIDOS.length];
  const nombre =
    NOMBRES[Math.floor(offset / (APELLIDOS.length * APELLIDOS.length)) % NOMBRES.length];
  return `${apellido1} ${apellido2} ${nombre}`;
}

/**
 * A month's «Venta de Servicios por FACTURA» report.
 *
 * **The billing is NOT the month's accounting revenue, and that is deliberate**: it comes from the
 * statement's revenue plus a deterministic offset of ±4 %, which is the difference recognition
 * timings, credit notes and VAT produce in reality. A set in which the two figures coincided would
 * show the opposite of what the app declares on that screen.
 *
 * The shape reproduces the real file's, and what has to be reproduced is this:
 *
 *   - a preamble spread across loose cells, with the pagination twenty columns from the company;
 *   - `Desde:` / `Hasta:` with their date in a cell SEPARATE from the label;
 *   - the four-label header **misaligned from its own data**, because it goes centred over merged
 *     cells: `CANTIDAD` falls one column to the right of the quantities and `VENTA TOTAL` one to the
 *     right of the amounts;
 *   - FLAT rows: each one is a complete line that repeats its service's code. There is no grouping by
 *     service, no subtotals and no header reprinted per page — the file says «1 de 53» and even so it
 *     comes out as one continuous block;
 *   - the close in two rows: `TOTAL ITEMS` with the line COUNT, and below it the total in dollars with
 *     NO LABEL AT ALL, aligned under the quantity and amount columns.
 */
function writeVentas(
  rubro: Rubro,
  accounts: FlatAccount[],
  year: number,
  month: number,
  dir: string,
): void {
  const values = rollup(accounts, leafValues(rubro, accounts, year, month));
  const ingreso = rootTotal(values, "4");
  const facturado = round2(
    ingreso * randRange(`${rubro.slug}|${year}|${month}|facturado`, 0.96, 1.04),
  );

  // The real file's columns. The labels go in OTHERS —see the header block—, and that misalignment is
  // exactly what a parser reading by the label's column would not survive.
  const CODE_COL = 1;
  const SERVICE_COL = 7;
  const PAYER_COL = 14;
  const QUANTITY_COL = 18;
  const AMOUNT_COL = 24;
  const WIDTH = 27;
  const at = (cells: Record<number, Cell>): Cell[] =>
    Array.from({ length: WIDTH }, (_unused, index) => cells[index] ?? null);

  const rows: Cell[][] = [
    at({ 3: rubro.company, 23: "Página:", 26: "1 de 12" }),
    at({ 23: "Fecha:", 26: excelSerial(year, month, 5) }),
    // With the spare space the real report writes after «FACTURA».
    at({ 3: "Venta de Servicios por FACTURA " }),
    at({}),
    at({
      8: "Desde:",
      11: dmy(1, month, year),
      15: "Hasta:",
      16: dmy(lastDayOfMonth(year, month), month, year),
    }),
    at({}),
    at({ 2: "CODIGO", 10: "NOMBRE", 19: "CANTIDAD", 25: "VENTA TOTAL" }),
  ];

  const pagadores = pagadoresDelMes(rubro, year, month);
  const parado = servicioParado(rubro, year, month);
  // The services that DO move split the WHOLE month between them: if one is idle, its weight is
  // redistributed, so what is billed does not depend on how many moved.
  const activos = SERVICIOS.filter((servicio) => servicio.code !== parado);
  const pesoActivo = activos.reduce((acc, servicio) => acc + servicio.weight, 0);

  let total = 0;
  let items = 0;
  let cantidadTotal = 0;

  const emit = (servicio: (typeof SERVICIOS)[number], payerIndex: number, monto: number): void => {
    const cantidad = 1 + Math.floor(rand(`${servicio.code}|${payerIndex}|${month}|cant`) * 9);
    cantidadTotal += cantidad;
    items += 1;
    total = round2(total + monto);
    rows.push(
      at({
        [CODE_COL]: servicio.code,
        [SERVICE_COL]: servicio.name,
        [PAYER_COL]: pagadorAt(payerIndex),
        [QUANTITY_COL]: cantidad,
        [AMOUNT_COL]: monto,
      }),
    );
  };

  activos.forEach((servicio) => {
    const objetivo = round2((facturado * servicio.weight) / pesoActivo);
    // How many of the month's payers bought THIS service — never all of them.
    const cuantos = Math.max(
      1,
      Math.round(pagadores * cobertura(rubro, year, month, servicio.code)),
    );
    // The split decays, so a few concentrate — which is precisely the reading the concentration card
    // exists to give.
    const pesos = Array.from(
      { length: cuantos },
      (_unused, index) =>
        randRange(`${rubro.slug}|${year}|${month}|${servicio.code}|${index}`, 0.2, 1) /
        Math.pow(index + 1, 0.9),
    );
    const suma = pesos.reduce((acc, peso) => acc + peso, 0);
    let repartido = 0;
    pesos.forEach((peso, index) => {
      // The last one absorbs the rounding, so the lines add up to their target TO THE CENT and the
      // parser's balance does not fire a notice that is not a finding.
      const monto =
        index === pesos.length - 1
          ? round2(objetivo - repartido)
          : round2((objetivo * peso) / suma);
      repartido = round2(repartido + monto);
      emit(servicio, index, monto);
    });
  });

  if (parado) {
    const servicio = SERVICIOS.find((entry) => entry.code === parado);
    if (servicio) {
      emit(servicio, 0, 0);
    }
  }

  // The count of LINES, which are not dollars…
  rows.push(at({ 0: "TOTAL ITEMS", 5: items }));
  // …and the real total, with no label, under its columns.
  rows.push(at({ [QUANTITY_COL]: cantidadTotal, [AMOUNT_COL]: total }));

  writeWorkbook(rows, "Sheet1", join(dir, `Ventas-${year}-${mm(month)}.xlsx`));
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });

  const manifests: RubroManifest[] = [];
  let files = 0;

  for (const rubro of RUBROS) {
    const accounts = accountsOf(rubro);
    for (const year of YEARS) {
      for (let month = 0; month < 12; month++) {
        const dirOf = (system: SystemId): string => join(OUT_DIR, rubro.slug, system, String(year));
        writeCentros(rubro, accounts, year, month, dirOf("centros"));
        writeUnitario(rubro, accounts, year, month, dirOf("unitario"));
        writeMicroplus(rubro, accounts, year, month, dirOf("microplus"));
        writeDingoo(rubro, accounts, year, month, dirOf("dingoo"));
        files += 4;
        // The sales-by-service report exists only where the app reads it: it is the clinic's BILLING
        // report, not a fourth format of the estado de resultados, and a hotel does not issue it.
        if (rubro.slug === "rubro-c-clinica") {
          // Outside `dirOf`, which is typed against `SystemId`: sales is not a fourth system issuing
          // the estado de resultados, it is ANOTHER report of the same accounting system, and putting
          // it in that union would leave it looking like a PyG upload format.
          writeVentas(
            rubro,
            accounts,
            year,
            month,
            join(OUT_DIR, rubro.slug, "ventas", String(year)),
          );
          files += 1;
        }
      }
    }
    manifests.push(buildManifest(rubro, accounts));
    console.log(`  ${rubro.slug}: ${accounts.length} cuentas`);
  }

  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    `${JSON.stringify({ anios: YEARS, rubros: manifests }, null, 2)}\n`,
  );
  writeFileSync(join(OUT_DIR, "README.md"), readme(manifests));
  console.log(`Listo: ${files} archivos en ${OUT_DIR}`);
}

main();
