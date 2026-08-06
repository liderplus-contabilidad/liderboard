/**
 * El formulario de alta de un empleado: sus valores, su validación y su traducción a una ficha.
 *
 * Vive aquí y no dentro del modal porque es la única parte del alta con reglas que puedan estar
 * mal — qué es obligatorio, qué forma tiene una cédula, qué rango admiten los días — y una regla
 * sin test es una regla que nadie comprueba. El componente se queda con lo que sí es suyo: pintar
 * los controles y decidir CUÁNDO enseñar los errores.
 *
 * `validateEmployeeForm` devuelve errores **por campo** y no un booleano: la pantalla tiene que
 * poder señalar cuál falla, y con un `false` solo podría decir «algo está mal».
 *
 * Sobre la CÉDULA: se exige la forma —diez dígitos— y **no** el dígito verificador. Es deliberado.
 * El importador escribe lo que el archivo del contador diga, sin juzgarlo, así que un formulario
 * más estricto que el importador crearía empleados que la app deja cargar por Excel pero no dar de
 * alta a mano; y un documento que el algoritmo del registro civil rechaza —un pasaporte, una cédula
 * antigua— bloquearía un alta real sin que quien la hace pueda hacer nada. La forma atrapa el
 * teclazo, que es el error frecuente; el dígito verificador atraparía además al empleado legítimo.
 */
import { STANDARD_PAYROLL_AREAS } from "./areas";
import { emptyCapture } from "./employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import { reserveFundFlags, type ReserveFundMode } from "./reserve-fund";
import type { ParsedPayrollEmployeeLine } from "./types";

/**
 * Lo que el formulario tiene en la mano. Las cifras son `number | null` y no texto porque
 * `NumericInput` ya resuelve el paso de texto a número (y lo tiene testeado): aquí se juzgan
 * VALORES, no lo que alguien está tecleando a medias. `null` es «el campo está vacío».
 */
export interface EmployeeFormValues {
  // La ficha
  name: string;
  idCard: string;
  role: string;
  area: string;
  baseSalary: number | null;
  days: number | null;
  contractType: "CT" | "TP";
  /** Los tres casos de §7, ya cruzados — ver `reserve-fund.ts`. */
  reserveFund: ReserveFundMode;
  /** ISO `YYYY-MM-DD`, o `""` si no se declara. */
  hireDate: string;
  sectorCode: string;

  /** `M` · el importe reconocido. `null` = todas las trabajadas, `0` = ninguna (el `*0` del
   *  libro), cualquier otro número = ese importe. Ver §6 y §11.1. */
  approvedOvertime: number | null;
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
}

export type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>;

/** Lo que hace falta saber de la nómina ya registrada para detectar un alta repetida. */
export interface EmployeeFormContext {
  existing?: readonly { name: string; idCard: string }[];
}

const MAX_DAYS = 31;
const ID_CARD_DIGITS = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un formulario recién abierto. Los dos defaults con criterio:
 *
 *   - **30 días**, el mismo que `copyRoster` pone al copiar una nómina — un mes completo es el
 *     caso normal y los días se corrigen solo cuando hubo un ingreso a mitad de mes, una salida o
 *     una licencia.
 *   - **El SBU vigente** como sueldo base, leído de los parámetros del período y no escrito a
 *     mano, para que el enero en que el SBU suba no deje aquí el número del año pasado.
 */
export function emptyEmployeeForm(): EmployeeFormValues {
  return {
    name: "",
    idCard: "",
    role: "",
    area: STANDARD_PAYROLL_AREAS[0],
    baseSalary: DEFAULT_PAYROLL_PARAMETERS.unifiedBasicSalary,
    days: DEFAULT_PAYROLL_PARAMETERS.monthlyDays,
    contractType: "CT",
    reserveFund: "sin-derecho",
    hireDate: "",
    sectorCode: "",
    approvedOvertime: null,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
  };
}

/** Una fecha ISO que además EXISTE: `2026-02-30` pasa el patrón y no es un día del calendario. */
function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Una cantidad opcional del mes: vacía vale, negativa no. */
function checkOptionalAmount(value: number | null, label: string): string | undefined {
  if (value === null) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return `${label} tiene que ser un número.`;
  }
  return value < 0 ? `${label} no puede ser negativo.` : undefined;
}

/**
 * Qué campos del formulario están mal, y por qué. Un formulario correcto devuelve `{}`.
 *
 * `context.existing` es la nómina que el período ya tiene: con ella, dar de alta dos veces a la
 * misma persona se rechaza NOMBRANDO a quien ya la ocupa. Sin esa comprobación las dos filas
 * suman por separado en los KPIs del período y nada en pantalla lo delata, porque el nombre
 * tecleado dos veces rara vez sale idéntico.
 */
export function validateEmployeeForm(
  values: EmployeeFormValues,
  context: EmployeeFormContext = {},
): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {};

  if (values.name.trim() === "") {
    errors.name = "El nombre es obligatorio.";
  }

  if (values.role.trim() === "") {
    errors.role = "El cargo es obligatorio.";
  }

  const idCard = values.idCard.trim();
  if (idCard === "") {
    errors.idCard = "La cédula es obligatoria.";
  } else if (!new RegExp(`^\\d{${ID_CARD_DIGITS}}$`).test(idCard)) {
    errors.idCard = `La cédula son ${ID_CARD_DIGITS} dígitos.`;
  } else {
    const clash = context.existing?.find((line) => line.idCard.trim() === idCard);
    if (clash) {
      errors.idCard = `${clash.name} ya está registrado con esta cédula en el período.`;
    }
  }

  if (values.baseSalary === null) {
    errors.baseSalary = "El sueldo base es obligatorio.";
  } else if (!Number.isFinite(values.baseSalary) || values.baseSalary <= 0) {
    // Con el sueldo base en cero todo el rol del empleado cae a cero —unificado, décimo tercero,
    // aporte al IESS— y la fila queda sumando nada: es un error de captura, no un caso del negocio.
    errors.baseSalary = "El sueldo base tiene que ser mayor que cero.";
  }

  if (values.days === null) {
    errors.days = "Los días trabajados son obligatorios.";
  } else if (!Number.isInteger(values.days)) {
    errors.days = "Los días trabajados van en días enteros.";
  } else if (values.days < 0 || values.days > MAX_DAYS) {
    errors.days = `Los días trabajados van de 0 a ${MAX_DAYS}.`;
  }

  if (values.hireDate !== "" && !isRealIsoDate(values.hireDate)) {
    errors.hireDate = "La fecha de ingreso no es una fecha válida.";
  }

  const approved = checkOptionalAmount(values.approvedOvertime, "El importe aprobado");
  if (approved) {
    errors.approvedOvertime = approved;
  }

  return errors;
}

/** Si la sección del mes trae algo que guardar. Ver `toEmployeeLine`. */
function hasMonthlyCapture(values: EmployeeFormValues): boolean {
  return (
    values.approvedOvertime !== null || values.provisionsThirteenth || values.provisionsFourteenth
  );
}

/**
 * El formulario ya validado, como la ficha que `db.ts` escribe. No lleva `id` ni `periodId`: los
 * estampa la puerta, igual que con `copyRoster` y con el importador.
 *
 * **`capture` queda AUSENTE cuando nadie tocó la sección del mes**, que es la misma regla que
 * `copyRoster` — no es lo mismo «este mes no trae nada» que «este mes trae ceros», y un empleado
 * recién dado de alta tiene que leerse igual que uno copiado del mes anterior. En cuanto hay un
 * recorte tecleado o una provisión encendida, la captura se adjunta ENTERA (`emptyCapture()` como
 * base), porque lo que el motor consume es una captura completa — y con ella van las horas extras
 * en cero, que es lo que valen mientras nadie las teclee en la ficha.
 *
 * Sin captura no hay `PAGADO` declarado, así que el empleado nace «sin conciliar» — que es
 * exactamente lo que es. En cuanto alguien teclee lo transferido, concilia contra el rol que el
 * motor calcula, sin ningún archivo de por medio.
 */
export function toEmployeeLine(values: EmployeeFormValues): ParsedPayrollEmployeeLine {
  const line: ParsedPayrollEmployeeLine = {
    name: values.name.trim(),
    role: values.role.trim(),
    area: values.area,
    baseSalary: values.baseSalary ?? 0,
    contractType: values.contractType,
    idCard: values.idCard.trim(),
    hireDate: values.hireDate === "" ? null : values.hireDate,
    sectorCode: values.sectorCode.trim(),
    ...reserveFundFlags(values.reserveFund),
    days: values.days ?? 0,
  };

  if (!hasMonthlyCapture(values)) {
    return line;
  }

  return {
    ...line,
    capture: {
      ...emptyCapture(),
      approvedOvertime: values.approvedOvertime,
      provisionsThirteenth: values.provisionsThirteenth,
      provisionsFourteenth: values.provisionsFourteenth,
    },
  };
}
