/**
 * Reading the rol de pagos' `GENERAL` sheet: WHERE each element sits. Everything is located by
 * the labels the report itself writes, never by a fixed row or column — the sheet's own row 1 is
 * a hand-typed VLOOKUP index list that is DESYNCED (column `AR` is blank across every row and was
 * skipped when the list was typed, so every index from `AS` on names the wrong column), which is
 * exactly the failure mode a coordinate-based reader would inherit silently. The same rule
 * `microplus-grid.ts`/`dingoo-grid.ts` follow.
 *
 * The rótulos live in TWO rows (row 2 rótula `M`–`BH`, row 3 rótula `A`–`L`), so — unlike those
 * two modules, whose header lives on one row — this module doesn't return a single "header row";
 * `findLabel` scans the whole sheet for each label independently and takes the FIRST match,
 * top-to-bottom then left-to-right. Varios rótulos se repiten más abajo (`LIQUIDO A RECIBIR` en
 * `BH` tras `AP`, `PAGADO` en `CC` tras `BZ`, `COSTO TOTAL` dentro del bloque de asientos tras
 * `AY`, y ese mismo bloque REPITE como descripción `PRESTAMOS EMPRESARIALES`, `ALMUERZOS` y
 * `CONTRIBUCION SOLIDARIA`, que son tres rótulos de egreso): the report always writes its real
 * header first, so "first match" tells them apart without a coordinate, the same trick
 * `findMicroplusHeader`'s first-match assignment uses.
 *
 * La otra trampa es al revés y es de la fila 2: sobre las columnas de horas extras hay dos
 * rótulos AGRUPADORES (`" No. HORAS EXTRAS"` sobre `G`–`I`, `"VALOR DE HORAS EXTRAS"` sobre
 * `J`–`L`) que están por ENCIMA de los rótulos reales de la fila 3. El primero empieza igual que
 * el `"No. "` que nombra el ordinal, así que la comparación tiene que ser por la etiqueta ENTERA
 * —nunca por prefijo—, que es justo lo que `findLabel` hace.
 *
 * Split from `rol-general.ts` so the delicate half — label location, area attribution, and the
 * employee/area/skip row classification — is testable over bare grids, with no workbook fixtures
 * in the way. Kept convention-free the same way `lib/excel/workbook.ts` is: contract-type
 * validation and hire-date semantics (what "unparseable" MEANS) stay in `rol-general.ts`, which
 * owns the domain; this file only reads what is there.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { compactLabel, normalizeLabel, toNumber, type Cell } from "@/lib/excel/workbook";

/** `"MARZO 2026"` (`GENERAL!B2`) → `{ year: 2026, monthIndex: 2 }`. `null` when the cell isn't
 * text, or its shape isn't "word, whitespace, four-digit year", or the word doesn't match one of
 * `MONTHS_FULL_ES` once accents and case are stripped. Matched with `\p{L}+` rather than `[a-z]+`
 * so an accented month name (a file that DOES write `Á`) is accepted too, even though today's
 * `MONTHS_FULL_ES` entries carry none. */
const PERIOD_TEXT = /^(\p{L}+)\s+(\d{4})$/u;

export interface PeriodRef {
  year: number;
  monthIndex: number;
}

export function parsePeriodText(cell: Cell): PeriodRef | null {
  if (typeof cell !== "string") {
    return null;
  }
  const match = PERIOD_TEXT.exec(cell.trim());
  if (!match) {
    return null;
  }
  const monthIndex = MONTHS_FULL_ES.findIndex(
    (month) => normalizeLabel(month) === normalizeLabel(match[1]),
  );
  if (monthIndex === -1) {
    return null;
  }
  return { year: Number(match[2]), monthIndex };
}

/**
 * EL PERÍODO, POR SU FORMA Y NO POR SU CELDA — la última coordenada que quedaba en este archivo.
 *
 * Se leía en `B2` fijo, que era la única excepción a la regla que la cabecera de este módulo
 * declara: todo se localiza por lo que el informe escribe. La excepción dejó de sostenerse cuando la
 * app empezó a GENERAR este mismo formato: su membrete abre unas filas por encima del preámbulo y
 * `B2` deja de ser `B2`, así que el archivo descargado no habría podido volver a entrar.
 *
 * Se barre por encima de la cabecera `EMPLEADO` —donde vive el preámbulo y nada más— y se toma la
 * primera celda cuyo texto ENTERO sea «mes año». Los archivos que la firma ya tiene se leen igual:
 * su `B2` es la primera que casa. Y nada más de ese preámbulo puede casar por accidente, porque
 * `parsePeriodText` exige que el mes esté en `MONTHS_FULL_ES` y que la celda no lleve nada más.
 */
export function findPeriod(grid: readonly Cell[][], headerRow: number | null): PeriodRef | null {
  const end = headerRow ?? grid.length;
  for (let row = 0; row < end; row++) {
    for (const cell of grid[row] ?? []) {
      const period = parsePeriodText(cell);
      if (period) {
        return period;
      }
    }
  }
  return null;
}

/** Excel's day-0 in the (non-1904) epoch every desktop workbook uses: `1899-12-30`, already
 * absorbing the classic "1900 was a leap year" bug SheetJS's `raw: true` doesn't correct for. A
 * date cell arrives as this serial, not as text, because `readGrid` never passes `cellDates`. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** `null` when the cell isn't a positive finite number — never a thrown error, since an
 * unparseable hire date is one employee's bad cell, not a reason to fail the whole file. */
export function excelSerialToISODate(cell: Cell): string | null {
  if (typeof cell !== "number" || !Number.isFinite(cell) || cell <= 0) {
    return null;
  }
  const date = new Date(EXCEL_EPOCH_UTC + Math.floor(cell) * MS_PER_DAY);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every column this parser reads, by its own key. `ordinalCol` (`No.`) is never stored on the
 * ficha — it exists purely so an area row (name only) can be told apart from an employee row
 * (ordinal AND name).
 *
 * Qué CAMPO del motor lleva cada columna está declarado una sola vez en `lib/payroll/concepts.ts`
 * y no se repite aquí: lo que este archivo añade es lo único que aquel no puede tener, el RÓTULO
 * con el que el libro escribe esa columna —«Anticipo de sueldo» en la pantalla es `ANTICIPO
 * SUELDO` en la hoja, y el parser localiza por lo segundo. */
type ColumnKey =
  | "ordinalCol"
  | "employeeCol"
  | "roleCol"
  | "baseSalaryCol"
  | "daysCol"
  | "contractTypeCol"
  | "idCardCol"
  | "hireDateCol"
  | "sectorCodeCol"
  | "hasReserveFundCol"
  | "accumulatesReserveFundCol"
  | "overtimeHours50Col"
  | "overtimeHours100Col"
  | "overtimeHours25Col"
  | "overtimePay50Col"
  | "overtimePay100Col"
  | "overtimePay25Col"
  | "overtimeTotalCol"
  | "vacationPayCol"
  | "privateInsuranceCol"
  | "allowancesCol"
  | "fixedCommissionCol"
  | "variableCommissionCol"
  | "bonusCol"
  | "iessLoansCol"
  | "unpaidLeaveCol"
  | "salaryAdvanceCol"
  | "companyLoansCol"
  | "incomeTaxCol"
  | "mealsCol"
  | "finesCol"
  | "inHouseConsumptionCol"
  | "solidarityContributionCol"
  | "otherDeductionsCol"
  | "partTimeDeductionCol"
  | "medicalLeaveDeductionCol"
  | "thirteenthProvisionCol"
  | "fourteenthProvisionCol"
  | "paidCol";

export type RolGeneralColumns = Record<ColumnKey, number | null> & {
  /** Row `EMPLEADO` was found on — employee/area scanning starts right below it. */
  headerRow: number | null;
  /** Row `SUMAN` was found on — scanning stops right above it, so the asientos contables block
   * starting further down (which also carries values in what look like an account "No." and
   * "name" column) is never read as nómina. */
  sumanRow: number | null;
};

interface LabelSpec {
  key: ColumnKey;
  /** Already `compactLabel`-normalized, so `findLabel` can compare directly. */
  label: string;
  /** As the report itself writes it, for the "columna no encontrada" warning. */
  display: string;
}

/** El orden es el del libro (`A` → `CA`), que es el mismo del comprobante `INDIVIDUAL` y el de
 * `concepts.ts`: así el aviso agrupado de columnas ausentes las nombra en el orden en que quien
 * abre el Excel las va a buscar. El comentario de cada entrada es su LETRA en la hoja. */
const LABEL_SPECS: readonly LabelSpec[] = [
  { key: "ordinalCol", label: "no.", display: "No." }, // A
  { key: "employeeCol", label: "empleado", display: "EMPLEADO" }, // B
  { key: "roleCol", label: "cargo", display: "CARGO" }, // C
  { key: "baseSalaryCol", label: "sueldo base", display: "SUELDO BASE" }, // D
  { key: "daysCol", label: "dias", display: "DIAS" }, // E
  // G, H, I — las CANTIDADES de horas. El libro rotula la tercera clase «15 %» aquí y «25 %» en
  // su valor (`L`): se copia tal cual, porque lo que se busca es el texto de la hoja, no el que
  // debería decir. Es la pregunta abierta §11.2, y arreglarla aquí rompería la localización.
  { key: "overtimeHours50Col", label: "horas extras 50%", display: "HORAS EXTRAS 50%" },
  { key: "overtimeHours100Col", label: "horas extras 100%", display: "HORAS EXTRAS 100%" },
  { key: "overtimeHours25Col", label: "horas extras 15%", display: "HORAS EXTRAS 15%" },
  // J, K, L — su VALOR. No son campos de la captura (el motor los deriva), pero se leen porque
  // son el término contra el que `M` se compara para recuperar el importe aprobado (§6), y
  // recalcularlos aquí no serviría: en el archivo real una fila usa 0,15 donde las demás usan
  // 0,25, así que un `J+K+L` derivado no coincidiría con el `M` que el libro guardó.
  { key: "overtimePay50Col", label: "valor ganado extras 50%", display: "VALOR GANADO EXTRAS 50%" },
  {
    key: "overtimePay100Col",
    label: "valor ganado extras 100%",
    display: "VALOR GANADO EXTRAS 100%",
  },
  { key: "overtimePay25Col", label: "valor ganado extras 25%", display: "VALOR GANADO EXTRAS 25%" },
  { key: "overtimeTotalCol", label: "total horas extras", display: "TOTAL HORAS EXTRAS" }, // M
  { key: "vacationPayCol", label: "vacaciones - mensual", display: "VACACIONES - MENSUAL" }, // P
  { key: "privateInsuranceCol", label: "seguro privado", display: "SEGURO PRIVADO" }, // Q
  { key: "allowancesCol", label: "viaticos/vivienda", display: "VIATICOS/VIVIENDA" }, // R
  {
    key: "fixedCommissionCol",
    label: "comision fija por vtas.",
    display: "COMISION FIJA POR VTAS.",
  }, // S
  { key: "variableCommissionCol", label: "comision variable", display: "COMISION VARIABLE" }, // T
  { key: "bonusCol", label: "bono cumplimiento", display: "BONO CUMPLIMIENTO" }, // V
  {
    key: "iessLoansCol", // Y
    label: "prestamos quirografarios e hipotecarios",
    display: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
  },
  { key: "unpaidLeaveCol", label: "licencia sin sueldo", display: "LICENCIA SIN SUELDO" }, // Z
  { key: "salaryAdvanceCol", label: "anticipo sueldo", display: "ANTICIPO SUELDO" }, // AA
  { key: "companyLoansCol", label: "prestamos empresariales", display: "PRESTAMOS EMPRESARIALES" }, // AB
  { key: "incomeTaxCol", label: "impuesto renta", display: "IMPUESTO RENTA" }, // AC
  { key: "mealsCol", label: "almuerzos", display: "ALMUERZOS" }, // AD
  { key: "finesCol", label: "multas", display: "MULTAS" }, // AE
  {
    key: "inHouseConsumptionCol", // AF
    label: "consumo locales empleado",
    display: "CONSUMO LOCALES EMPLEADO",
  },
  {
    key: "solidarityContributionCol", // AG — el libro lo parte en dos líneas; `compactLabel` lo une
    label: "contribucion solidaria",
    display: "CONTRIBUCION SOLIDARIA",
  },
  { key: "otherDeductionsCol", label: "otros", display: "OTROS" }, // AH — con un espacio sobrante
  // AI — «PACIAL» es la errata del libro, y se busca con ella: corregirla aquí dejaría de
  // encontrar la columna en todos los archivos que la firma ya tiene.
  {
    key: "partTimeDeductionCol",
    label: "descuento tiempo pacial",
    display: "DESCUENTO TIEMPO PACIAL",
  },
  {
    key: "medicalLeaveDeductionCol", // AN
    label: "descuento permiso medico",
    display: "Descuento PERMISO MEDICO",
  },
  { key: "thirteenthProvisionCol", label: "xiii", display: "XIII" }, // AS
  { key: "fourteenthProvisionCol", label: "xiv", display: "XIV" }, // AT
  { key: "accumulatesReserveFundCol", label: "ac fr", display: "AC FR" }, // AZ
  { key: "hasReserveFundCol", label: "fr", display: "FR" }, // BA
  { key: "contractTypeCol", label: "tc", display: "TC" }, // BB
  { key: "hireDateCol", label: "fecha ingreso", display: "FECHA INGRESO" }, // BC
  { key: "idCardCol", label: "cedula", display: "CÉDULA" }, // BD
  { key: "sectorCodeCol", label: "codigo sectorial", display: "CODIGO SECTORIAL" }, // BF
  { key: "paidCol", label: "pagado", display: "PAGADO" }, // BZ
];

const SUMAN_LABEL = "suman";

/** First cell whose `compactLabel` equals `target`, scanning row by row then column by column. */
function findLabel(grid: readonly Cell[][], target: string): { row: number; col: number } | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    for (let col = 0; col < cells.length; col++) {
      if (compactLabel(cells[col]) === target) {
        return { row, col };
      }
    }
  }
  return null;
}

export function locateColumns(grid: readonly Cell[][]): RolGeneralColumns {
  const columns = {} as RolGeneralColumns;
  for (const spec of LABEL_SPECS) {
    columns[spec.key] = findLabel(grid, spec.label)?.col ?? null;
  }
  columns.headerRow = findLabel(grid, "empleado")?.row ?? null;
  columns.sumanRow = findLabel(grid, SUMAN_LABEL)?.row ?? null;
  return columns;
}

/** The Spanish labels of every column the report was expected to carry but didn't — in the
 * report's own reading order, for a SINGLE grouped warning (never one per column). */
export function missingColumnLabels(columns: RolGeneralColumns): string[] {
  return LABEL_SPECS.filter((spec) => columns[spec.key] === null).map((spec) => spec.display);
}

function isFilled(cell: Cell): boolean {
  return cell !== null && !(typeof cell === "string" && cell.trim() === "");
}

/** Reads a cell as text tolerating either representation: most identity columns (cédula, código
 * sectorial) arrive as text, but Excel is free to store a 10-digit cédula as a plain number
 * instead — `String()` round-trips it exactly since it is far under `Number.MAX_SAFE_INTEGER`. */
function cellText(cell: Cell): string {
  if (typeof cell === "string") {
    return cell.trim();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return String(cell);
  }
  return "";
}

function valueAt(row: readonly Cell[], col: number | null): Cell {
  return col === null ? null : (row[col] ?? null);
}

/** One employee row as the grid holds it — raw values only. `contractTypeRaw` isn't yet checked
 * against `"CT" | "TP"` and `hireDateRaw` isn't yet converted from its Excel serial: both are
 * domain decisions (what counts as valid, what "unparseable" means) that `rol-general.ts` owns.
 *
 * Todo lo que termina en `Raw` sigue esa misma frontera: `hasReserveFundRaw`/
 * `accumulatesReserveFundRaw` traen el texto de la celda sin decidir qué cuenta como «sí», y
 * `thirteenthProvisionRaw`/`fourteenthProvisionRaw` traen el importe de `AS`/`AT` sin decidir qué
 * cuenta como «encendida». Aquí solo se lee lo que hay. */
export interface RolGeneralEmployeeRow {
  area: string;
  name: string;
  role: string;
  baseSalary: number;
  days: number;
  contractTypeRaw: string;
  idCard: string;
  hireDateRaw: Cell;
  sectorCode: string;
  hasReserveFundRaw: string;
  accumulatesReserveFundRaw: string;
  /** `G`, `H`, `I` — cantidades de horas. */
  overtimeHours50: number;
  overtimeHours100: number;
  overtimeHours25: number;
  /** `J`, `K`, `L` — su valor, TAL COMO EL LIBRO lo trae. No viajan a la captura (el motor los
   * deriva): existen para que `rol-general.ts` pueda comparar `M` contra `J+K+L` y recuperar
   * cuánto se reconoció. */
  overtimePay50: number;
  overtimePay100: number;
  overtimePay25: number;
  /** `M` — el total reconocido. `null` solo cuando el libro no declara la columna, misma
   * convención que `paid`: sin ella no se puede afirmar que no se reconociera ninguna hora. */
  overtimeTotal: number | null;
  /** `P`…`T`, `V` — los ingresos capturados. */
  vacationPay: number;
  privateInsurance: number;
  allowances: number;
  fixedCommission: number;
  variableCommission: number;
  bonus: number;
  /** `Y`…`AN` — los doce egresos con rótulo. `X` (aporte IESS) no está: lo deriva el motor, y
   * `AJ`–`AM` tampoco, porque sin rótulo no hay forma de localizarlas (§11.4). */
  iessLoans: number;
  unpaidLeave: number;
  salaryAdvance: number;
  companyLoans: number;
  incomeTax: number;
  meals: number;
  fines: number;
  inHouseConsumption: number;
  solidarityContribution: number;
  otherDeductions: number;
  partTimeDeduction: number;
  medicalLeaveDeduction: number;
  /** `AS`, `AT` — el importe provisionado, del que se deduce si el mes provisiona los décimos. */
  thirteenthProvisionRaw: number;
  fourteenthProvisionRaw: number;
  /**
   * `null` cuando nadie declaró lo pagado: ni el libro trae la columna, ni la celda de este empleado
   * tiene nada. Es la ÚNICA columna que distingue el blanco del cero, y no por simetría con el resto
   * sino porque aquí las dos cosas significan distinto: sin `PAGADO` el empleado no está ni
   * conciliado ni con diferencia, mientras que un `0` escrito afirma que se le transfirió cero y
   * deja una diferencia igual a su líquido.
   *
   * Leía el blanco como `0`, con la convención de las otras cuarenta columnas. Se cambió al empezar
   * a generar este formato: el rol descargado escribe en blanco al que no tiene pago declarado, y
   * con la regla vieja volvía como «con diferencia» por todo su líquido — el archivo de la app no
   * habría podido describir su propio estado. Acierta también con el libro del contador, donde una
   * fila sin `PAGADO` es una que todavía no se ha pagado.
   */
  paid: number | null;
}

export interface RolGeneralReading {
  rows: RolGeneralEmployeeRow[];
  /** Grouped warnings this reading produced on its own (today: only the "sin área" count).
   * Column-validity and per-employee data warnings are `rol-general.ts`'s to add. */
  warnings: string[];
}

/**
 * The body: every row between the `EMPLEADO` header and `SUMAN` (exclusive on both ends),
 * classified by what columns `A` (ordinal) and `B` (nombre) carry:
 *  - only `B` → an ÁREA header (`ADMINISTRACION`, `HOSPEDAJE`…); becomes the area every employee
 *    row below it inherits, until the next one;
 *  - `A` AND `B` → an EMPLEADO row. The ordinal's own value never matters beyond "is it there" —
 *    it tolerates the file's own `"1-"` (a dash where every other row has a plain integer)
 *    without needing to parse it, because nothing downstream stores it;
 *  - neither → `SUBTOTAL`/`SUMAN` rows (their only content sits in column `C`) and blank rows;
 *    both fall out on their own here, without a rule of their own, the same phrase
 *    `readDingooAccounts`'s doc uses for its own blank rows.
 *
 * Without the `SUMAN` boundary this would keep reading into the asientos contables block that
 * follows (account codes like `621001` sit in `A` with a description in `B` — the same shape as
 * an ordinal-plus-nombre) and misread bookkeeping entries as employees.
 */
export function readEmployeeRows(
  grid: readonly Cell[][],
  columns: RolGeneralColumns,
): RolGeneralReading {
  if (columns.employeeCol === null || columns.headerRow === null) {
    return { rows: [], warnings: [] };
  }

  const start = columns.headerRow + 1;
  const end = columns.sumanRow ?? grid.length;
  const rows: RolGeneralEmployeeRow[] = [];
  let currentArea: string | null = null;
  let noAreaCount = 0;

  for (let r = start; r < end; r++) {
    const row = grid[r] ?? [];
    const name = cellText(valueAt(row, columns.employeeCol));
    if (!name) {
      continue;
    }
    if (!isFilled(valueAt(row, columns.ordinalCol))) {
      currentArea = name;
      continue;
    }
    if (currentArea === null) {
      noAreaCount++;
    }
    // Una columna que el libro no declara vale `0` como cualquier celda vacía: son cuarenta y
    // tantas y escribir `?? null` en cada una convertiría «este concepto no se usó» en un caso
    // aparte que ningún consumidor sabría tratar. Las dos excepciones —`PAGADO` y `M`— tienen su
    // propio motivo escrito en el tipo: de las dos, la ausencia sí dice algo distinto del cero.
    const num = (key: ColumnKey): number => toNumber(valueAt(row, columns[key]));
    const text = (key: ColumnKey): string => cellText(valueAt(row, columns[key]));
    /** Como `num`, pero distinguiendo la celda EN BLANCO del cero escrito. Solo `PAGADO` la usa, y
     *  por eso está aquí abajo: para las otras cuarenta y tantas columnas vacío ES cero. */
    const numOrNull = (key: ColumnKey): number | null => {
      const cell = valueAt(row, columns[key]);
      return isFilled(cell) ? toNumber(cell) : null;
    };
    rows.push({
      area: currentArea ?? "",
      name,
      role: text("roleCol"),
      baseSalary: num("baseSalaryCol"),
      days: num("daysCol"),
      contractTypeRaw: text("contractTypeCol"),
      idCard: text("idCardCol"),
      hireDateRaw: valueAt(row, columns.hireDateCol),
      sectorCode: text("sectorCodeCol"),
      hasReserveFundRaw: text("hasReserveFundCol"),
      accumulatesReserveFundRaw: text("accumulatesReserveFundCol"),
      overtimeHours50: num("overtimeHours50Col"),
      overtimeHours100: num("overtimeHours100Col"),
      overtimeHours25: num("overtimeHours25Col"),
      overtimePay50: num("overtimePay50Col"),
      overtimePay100: num("overtimePay100Col"),
      overtimePay25: num("overtimePay25Col"),
      overtimeTotal: columns.overtimeTotalCol === null ? null : num("overtimeTotalCol"),
      vacationPay: num("vacationPayCol"),
      privateInsurance: num("privateInsuranceCol"),
      allowances: num("allowancesCol"),
      fixedCommission: num("fixedCommissionCol"),
      variableCommission: num("variableCommissionCol"),
      bonus: num("bonusCol"),
      iessLoans: num("iessLoansCol"),
      unpaidLeave: num("unpaidLeaveCol"),
      salaryAdvance: num("salaryAdvanceCol"),
      companyLoans: num("companyLoansCol"),
      incomeTax: num("incomeTaxCol"),
      meals: num("mealsCol"),
      fines: num("finesCol"),
      inHouseConsumption: num("inHouseConsumptionCol"),
      solidarityContribution: num("solidarityContributionCol"),
      otherDeductions: num("otherDeductionsCol"),
      partTimeDeduction: num("partTimeDeductionCol"),
      medicalLeaveDeduction: num("medicalLeaveDeductionCol"),
      thirteenthProvisionRaw: num("thirteenthProvisionCol"),
      fourteenthProvisionRaw: num("fourteenthProvisionCol"),
      paid: numOrNull("paidCol"),
    });
  }

  const warnings: string[] = [];
  if (noAreaCount > 0) {
    warnings.push(
      noAreaCount === 1
        ? "1 empleado no tiene un área asignada (sin encabezado de área por encima)."
        : `${noAreaCount} empleados no tienen un área asignada (sin encabezado de área por encima).`,
    );
  }
  return { rows, warnings };
}
