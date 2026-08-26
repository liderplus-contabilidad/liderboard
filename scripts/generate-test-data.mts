/**
 * Genera el set de datos de prueba de PyG bajo `.context/generated/`, para manejar la app con
 * Playwright sin depender de los archivos reales de clientes que viven en `.context/`.
 *
 * Cubre los cuatro formatos de carga registrados en `lib/profit-loss/upload/` — mensual por
 * centros de costo, estado único mensual, MicroPlus y Dingoo — por cada uno de los tres rubros de
 * `test-data/rubros.mts` y por cada uno de los tres años, con los doce meses llenos.
 *
 * El eje que hace útil el set: para un mismo (rubro, año, mes) los cuatro sistemas emiten LOS
 * MISMOS números. Cada uno los escribe a su manera — MicroPlus guarda el gasto en negativo,
 * Dingoo el ingreso, y ambos numeran las cuentas con segmentos de dos dígitos — así que un test
 * que carga el mismo mes en dos sistemas y obtiene la misma utilidad está probando la
 * normalización de la estrategia y nada más. La columna `GENERAL` del formato por centros es, por
 * construcción, exactamente el valor del estado único del mismo mes.
 *
 * Determinista: los valores salen de un PRNG sembrado con el propio (rubro, año, mes, cuenta), sin
 * `Math.random` ni fechas, así que regenerar produce los mismos bytes y un test puede fijar cifras.
 *
 * Ejecutar con `pnpm gen:testdata`.
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
/** Última columna del formato por centros; el contrato la lee por POSICIÓN, siempre al final. */
const SIN_CENTRO = "SIN CENTRO DE COSTO";

// ─────────────────────────────────────────────────────────────────────────────
// PRNG sembrado por cadena — determinismo sin `Math.random`.
// ─────────────────────────────────────────────────────────────────────────────

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 sobre el hash de la semilla: [0, 1). */
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
// El plan de cuentas, aplanado y numerado por posición.
// ─────────────────────────────────────────────────────────────────────────────

interface FlatAccount {
  /** Segmentos numéricos, sin formato: `[4, 1, 1, 1, 1]`. */
  path: number[];
  key: string;
  /** El padre por ANIDAMIENTO, que no siempre es el código menos su último segmento — ver
   * `segment`. `undefined` en las dos raíces. */
  parentKey: string | undefined;
  name: string;
  level: number;
  root: "4" | "5";
  isLeaf: boolean;
  /** Solo hojas; los padres se recalculan sumando. */
  weight: number;
}

/**
 * Los segmentos que una cuenta añade al código de su padre: su POSICIÓN entre las hermanas, salvo
 * que el plan declare otra cosa (`segment`). Varios segmentos son un nivel que el informe SALTA,
 * como el `4.1.01.01` que cuelga directamente de `4.1` en el plan de la clínica.
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
// Códigos: un mismo `path`, tres convenciones.
// ─────────────────────────────────────────────────────────────────────────────

type SystemId = "centros" | "unitario" | "microplus" | "dingoo";

/**
 * `4.1.1.1.1` en los formatos propios de la app; `4.1.01.01.01` en MicroPlus (dos dígitos desde el
 * tercer segmento) y `4.01.01.02` en Dingoo (dos dígitos desde el segundo). Las tres convenciones
 * son incompatibles entre sí a propósito: es lo que hace que el sistema forme parte de la
 * identidad del workspace.
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
// Valores del mes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ingreso y gasto del mes. El gasto es una parte FIJA más una proporción de la venta, así que en
 * temporada baja hay meses en pérdida y en alta en utilidad sin que ninguna cifra esté puesta a
 * mano — es lo que da algo que mirar en Gráficos y en Análisis.
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

/** Valor de cada HOJA del mes, repartiendo el total de su raíz por pesos con ruido. */
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
 * Las cifras REALES que un (rubro, año) tiene transcritas, y que sustituyen a las sintéticas —
 * solo en MICROPLUS, que es el sistema del que salieron. Los otros tres siguen sacando ese mismo
 * año del PRNG, así que para ese par se rompe a propósito el eje del set («los cuatro sistemas dan
 * las mismas cifras»): lo que se gana a cambio es un archivo que reproduce el anexo de la firma, y
 * lo dice el README.
 */
const TRANSCRITAS: Record<string, Record<number, Record<string, number[]>>> = {
  "rubro-c-clinica": { 2026: CLINICA_2026 },
};

/**
 * Las hojas del mes tomadas de una transcripción, en la convención del generador: la tabla llega
 * VERBATIM del reporte —el gasto en negativo— y aquí es donde se vuelve del derecho, una sola vez.
 * Una hoja que la tabla no nombra vale 0, y una clave que no sea hoja de ESTE plan es un error: un
 * código mal escrito valdría si no como «esa cuenta no se movió», sin que ninguna cifra lo delate.
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

/** Lo que MicroPlus escribe ese mes: la transcripción si el (rubro, año) la tiene, y si no, el PRNG. */
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

/** Los padres, sumando hijos de abajo hacia arriba. Nunca se declaran: se derivan. */
function rollup(accounts: FlatAccount[], leaves: Map<string, number>): Map<string, number> {
  const values = new Map(leaves);
  const childrenOf = new Map<string, string[]>();
  for (const account of accounts) {
    // Por el padre del ANIDAMIENTO y no por el código menos su último segmento: un plan puede
    // saltarse un nivel (`4.1.01.01` cuelga de `4.1`), y ahí el padre por código no existe y su
    // rama se quedaría sin sumar.
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
// Reparto por centros de costo (solo modo «centros»).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Peso de un centro sobre una hoja. Estable en el tiempo (la semilla no lleva el mes), porque un
 * centro que cambiara de mezcla cada mes no se parecería a ningún hotel real. Un 18% de las ramas
 * queda en cero para un centro dado: sin eso las columnas serían copias escaladas entre sí y
 * cualquier gráfico comparándolas diría lo mismo.
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
 * Reparte el valor de una hoja entre los centros. El último centro con peso absorbe el redondeo,
 * de modo que Σ centros es EXACTAMENTE el valor de la hoja: así `GENERAL` cuadra al céntimo (que
 * es lo que revisa `merge-month.ts`) y coincide con lo que trae el estado único del mismo mes.
 */
function splitAcrossCenters(
  rubro: Rubro,
  leaf: FlatAccount,
  value: number,
  centers: string[],
): number[] {
  const weights = centers.map((center) => centerWeight(rubro, leaf, center));
  // Ninguna hoja se queda sin centro: si el azar apagó todas sus ramas, la primera columna se
  // lleva el valor entero, y así `GENERAL` sigue siendo exactamente el valor de la cuenta.
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
    // Los exports reales de Dingoo y de MicroPlus abren su rango en la columna B, y `readGrid`
    // reindexa desde el rango: el índice 0 de la grilla es la columna B del archivo. Reproducirlo
    // es lo que hace que el set sirva para probar que la estrategia localiza por etiqueta y no por
    // coordenada — una copiada de lo que se ve al abrir el archivo leería otra columna.
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

/** Serial de fecha de Excel (días desde el 30/12/1899), que es como la muestra de MicroPlus
 * guarda su fecha de impresión. */
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
 * El nombre VERBATIM, tal como el plan lo declara — ni una transformación.
 *
 * Los padres de un export real van en mayúsculas, y esto llegó a forzarlas aquí. Pero el plan real
 * de MicroPlus enseña que la mayúscula es del PLAN y no del reporte: sus cuentas padre son
 * mayúsculas salvo el paréntesis final de seis de ellas —`SEGUROS Y REASEGUROS (Primas y
 * Cesiones)`, `APORTES A LA SEGURIDAD SOCIAL (Incluído Fondo Res`—, que un reporte que las
 * transformara habría arrasado igual. Forzarlas aquí hacía imposible transcribir un plan tal cual,
 * que es justo lo que el rubro de la clínica necesita; los planes sintéticos declaran sus padres en
 * mayúsculas y salen igual que antes.
 */
function systemName(account: FlatAccount): string {
  return account.name;
}

// ── Mensual por centros de costo ────────────────────────────────────────────

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

  // El formato por centros no declara su periodo: lo declara el NOMBRE del archivo.
  writeWorkbook(rows, "Reporte", join(dir, `PyG-${year}-${mm(month)}.xlsx`));
}

// ── Estado único mensual ────────────────────────────────────────────────────

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

  // El nombre es libre a propósito: este formato declara su propio periodo dentro del archivo.
  writeWorkbook(rows, "Consulta Personas", join(dir, `EstadoResultados-${year}-${mm(month)}.xlsx`));
}

// ── MicroPlus ───────────────────────────────────────────────────────────────

/**
 * La columna del valor CODIFICA la profundidad (el reporte indenta hacia la derecha); `SALDO`, en
 * la 18, no rotula ninguna de ellas. Medidas sobre las 215 cuentas de `.context/microplus/mayo.xls`
 * — depende del NIVEL y nada más: una cuenta de nivel 5 valora en la 16 sea hoja o padre.
 */
const MICROPLUS_VALUE_COL: Record<number, number> = { 1: 23, 2: 22, 3: 19, 4: 17, 5: 16, 6: 14 };
/** A partir del nivel 6 la muestra deja de correrse: sus niveles 6 y 7 valoran en la misma. */
const MICROPLUS_DEEPEST_VALUE_COL = 14;
const MICROPLUS_WIDTH = 28;

/**
 * Una fila de MicroPlus, declarada por las columnas de la GRILLA que ve el parser. La muestra real
 * abre su rango en la columna B, así que la grilla va corrida una posición respecto del archivo:
 * `writeWorkbook` recorta el rango y esta función deja la columna A vacía para compensarla.
 */
function sparseRow(entries: Record<number, Cell>): Cell[] {
  const row: Cell[] = Array.from({ length: MICROPLUS_WIDTH + 1 }, () => null);
  for (const [col, value] of Object.entries(entries)) {
    row[Number(col) + 1] = value;
  }
  return row;
}

/** MicroPlus escribe sus cifras como TEXTO con separador de miles. `|| 0` normaliza el `-0` que
 * deja invertir una cuenta en cero: numéricamente da igual, pero `-0.00` no lo escribe nadie. */
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
      // La fecha de IMPRESIÓN, y va como serial de Excel igual que en la muestra. No es el
      // periodo, y `microplus-grid.ts` la salta junto con la paginación — tenerla aquí es
      // justamente lo que prueba que la salta.
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
    // MicroPlus guarda el gasto en NEGATIVO y suma (`RESULTADO = 4 + 5`); la app lo guarda en
    // positivo y resta, así que la rama 5 sale invertida del generador y `microplus.ts` la
    // vuelve a invertir al importar.
    const value = (values.get(account.key) ?? 0) * (account.root === "5" ? -1 : 1);
    rows.push(
      sparseRow({
        // El punto final marca cuenta padre — la app lo usa solo como contraste del árbol.
        1: formatCode(account.path, "microplus") + (account.isLeaf ? "" : "."),
        // El reporte indenta por nivel y manda las hojas al fondo, igual que la muestra real.
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
    // Razón social y nombre comercial, que en el export real solo se diferencian en el punto
    // final: `findDingooCompany` se queda con la PRIMERA, y esa estabilidad es lo que se prueba.
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
    // Dingoo guarda el INGRESO en negativo y suma; espejo exacto de MicroPlus, que invierte la 5.
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
// Manifiesto: lo que un test puede afirmar sin volver a abrir los .xlsx.
// ─────────────────────────────────────────────────────────────────────────────

interface RubroManifest {
  slug: string;
  empresa: string;
  ruc: string;
  centros: string[];
  cuentas: number;
  hojas: number;
  profundidadMaxima: number;
  /** Por año: los doce meses y el acumulado, en la convención de la app (4 suma, 5 resta). */
  anios: Record<string, YearManifest & { microplus?: YearManifest }>;
}

interface YearManifest {
  meses: { mes: number; ingresos: number; gastos: number; utilidad: number }[];
  total: { ingresos: number; gastos: number; utilidad: number };
}

/** Los doce meses de un año, resumidos, a partir de quien decida el valor de cada hoja. */
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
      // El año que MicroPlus trae transcrito no cuadra con el de los otros tres sistemas, así que
      // sale APARTE en vez de sustituir al de arriba: un test que fije cifras tiene que poder
      // decir de qué archivo habla.
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

/** El README va junto a los archivos y se reescribe con ellos: si algo cambia en el generador,
 * la descripción no puede quedarse contando la versión anterior. */
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
// Ventas por servicio — el reporte de FACTURACIÓN, que no es el estado de resultados.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los cinco servicios del reporte real, con su código verbatim y el peso con el que reparten la
 * facturación del mes. Los pesos son los del abril real de la clínica (46,7 % / 14,5 % / 13,5 % /
 * 12,7 % / 12,6 %), así que el set enseña la misma forma que la firma reconoce.
 */
const SERVICIOS: { code: string; name: string; weight: number }[] = [
  { code: "\\01", name: "HONORARIOS", weight: 0.467 },
  { code: "\\02", name: "MEDICINAS", weight: 0.145 },
  { code: "\\03", name: "EXAMENES DE LABORATORIO", weight: 0.135 },
  { code: "\\04", name: "INSUMOS", weight: 0.127 },
  { code: "\\05", name: "IMAGENES", weight: 0.126 },
];

/** Aseguradoras: nombres INVENTADOS con la forma de las reales (una palabra, o dos con una marca
 *  del ramo), que es lo que la heurística de `lib/sales/payer.ts` tiene que reconocer. */
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

/** Apellidos y nombres para componer pagadores PARTICULARES con la forma ecuatoriana —dos
 *  apellidos y dos nombres—, que es la que la heurística clasifica como persona. Inventados: un
 *  archivo versionado no es sitio para el nombre de un paciente. */
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
 * Cuántos pagadores DISTINTOS ve un mes. Varía por (rubro, año, mes) para que el set no sea doce
 * copias del mismo tamaño: lo que hay que poder probar es que la tarjeta de concentración cuenta
 * bien su cola —«los diez mayores son el N %»— con listas de tamaños distintos, y que el número de
 * pagadores no se confunda con el de líneas.
 */
function pagadoresDelMes(rubro: Rubro, year: number, month: number): number {
  return 40 + Math.floor(rand(`${rubro.slug}|${year}|${month}|pagadores`) * 80);
}

/**
 * Qué fracción de esos pagadores usó UN servicio. No todo el mundo compra de todo —en el archivo
 * real hay 2.774 líneas para 956 pagadores, o sea unos tres servicios por pagador—, y esto es lo
 * que hace que las líneas de un mes no sean pagadores × servicios y que dos meses traigan un
 * número de filas distinto.
 */
function cobertura(rubro: Rubro, year: number, month: number, code: string): number {
  return 0.3 + rand(`${rubro.slug}|${year}|${month}|${code}|cobertura`) * 0.6;
}

/**
 * Un servicio del catálogo que este mes NO se movió: sale con importe CERO en un solo pagador, que
 * es como un sistema contable declara una línea sin venta. Existe para que el set ejercite el aviso
 * «N servicios del catálogo no se movió en el periodo y no se dibuja», que de otro modo no se
 * dispararía nunca — un servicio ausente del todo no se puede contar.
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
  // Los tres componentes varían en ESCALAS distintas —unidades, ochos, sesenta y cuatros— para que
  // cada índice dé un nombre distinto. Con los tres tomando `offset` en la misma escala, el par de
  // apellidos quedaba determinado por `offset % 8` y sesenta pagadores se colapsaban en treinta y
  // dos: la cola que la tarjeta de concentración cuenta desaparecía a la mitad.
  const apellido1 = APELLIDOS[offset % APELLIDOS.length];
  const apellido2 = APELLIDOS[Math.floor(offset / APELLIDOS.length) % APELLIDOS.length];
  const nombre =
    NOMBRES[Math.floor(offset / (APELLIDOS.length * APELLIDOS.length)) % NOMBRES.length];
  return `${apellido1} ${apellido2} ${nombre}`;
}

/**
 * El reporte «Venta de Servicios por FACTURA» de un mes.
 *
 * **La facturación NO es el ingreso contable del mes, y eso es deliberado**: sale del ingreso del
 * estado más un desfase determinista de ±4 %, que es la diferencia que en la realidad producen los
 * tiempos de reconocimiento, las notas de crédito y el IVA. Un set en el que las dos cifras
 * coincidieran enseñaría lo contrario de lo que la app declara en esa pantalla.
 *
 * La forma reproduce la del archivo real, y lo que hay que reproducir es esto:
 *
 *   - preámbulo repartido por celdas sueltas, con la paginación a veinte columnas de la empresa;
 *   - `Desde:` / `Hasta:` con su fecha en una celda SEPARADA del rótulo;
 *   - la cabecera de cuatro rótulos **desalineada de sus propios datos**, porque va centrada sobre
 *     celdas combinadas: `CANTIDAD` cae una columna a la derecha de las cantidades y `VENTA TOTAL`
 *     una a la derecha de los importes;
 *   - filas PLANAS: cada una es una línea completa que repite el código de su servicio. No hay
 *     agrupación por servicio, ni subtotales, ni la cabecera reimpresa por página — el archivo dice
 *     «1 de 53» y aun así sale como un bloque corrido;
 *   - el cierre en dos filas: `TOTAL ITEMS` con el RECUENTO de líneas, y debajo el total en dólares
 *     SIN NINGÚN RÓTULO, alineado bajo las columnas de cantidad e importe.
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

  // Las columnas del archivo real. Los rótulos van en OTRAS —ver el bloque de la cabecera—, y esa
  // desalineación es justo lo que un parser que leyera por la columna del rótulo no sobreviviría.
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
    // Con el espacio sobrante que el reporte real escribe tras «FACTURA».
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
  // Los servicios que SÍ se mueven reparten el mes ENTERO entre ellos: si uno queda parado, su peso
  // se redistribuye, de modo que lo facturado no dependa de cuántos se movieron.
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
    // Cuántos de los pagadores del mes compraron ESTE servicio — nunca todos.
    const cuantos = Math.max(
      1,
      Math.round(pagadores * cobertura(rubro, year, month, servicio.code)),
    );
    // El reparto decae, así que unos pocos concentran — que es justo la lectura que la tarjeta de
    // concentración existe para dar.
    const pesos = Array.from(
      { length: cuantos },
      (_unused, index) =>
        randRange(`${rubro.slug}|${year}|${month}|${servicio.code}|${index}`, 0.2, 1) /
        Math.pow(index + 1, 0.9),
    );
    const suma = pesos.reduce((acc, peso) => acc + peso, 0);
    let repartido = 0;
    pesos.forEach((peso, index) => {
      // El último absorbe el redondeo, para que las líneas sumen su objetivo AL CENTAVO y el cuadre
      // del parser no dispare un aviso que no es un hallazgo.
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

  // El recuento de LÍNEAS, que no son dólares…
  rows.push(at({ 0: "TOTAL ITEMS", 5: items }));
  // …y el total de verdad, sin rótulo, bajo sus columnas.
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
        // El reporte de ventas por servicio existe solo donde la app lo lee: es el reporte de
        // FACTURACIÓN de la clínica, no un cuarto formato del estado de resultados, y un hotel no
        // lo emite.
        if (rubro.slug === "rubro-c-clinica") {
          // Fuera de `dirOf`, que se tipa contra `SystemId`: ventas no es un cuarto sistema que
          // emita el estado de resultados, es OTRO reporte del mismo sistema contable, y meterlo
          // en esa unión lo dejaría pareciendo un formato de carga de PyG.
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
