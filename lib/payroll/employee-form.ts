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
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import { reserveFundFlags, reserveFundMode, type ReserveFundMode } from "./reserve-fund";
import type { ParsedPayrollEmployeeLine, PayrollEmployeeLine } from "./types";

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

  /**
   * `AS`, `AT` · si se provisionan los décimos. Son de la FICHA (ver `PayrollEmployeeLine`), y por
   * eso están aquí y no entre lo que se captura del mes.
   *
   * El `M` del libro —el importe aprobado de horas extras— NO está en este formulario, y es
   * deliberado: es del MES, lo aprueba Gerencia según la ocupación, y este formulario no captura
   * las horas que ese importe recorta. Se teclea en la pantalla del empleado, junto a ellas.
   */
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
}

export type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>;

/** Lo que hace falta saber de la nómina ya registrada para detectar un alta repetida. */
export interface EmployeeFormContext {
  existing?: readonly { id?: string; name: string; idCard: string }[];
  /**
   * El empleado que se está EDITANDO, cuando lo hay. Sin él, abrir una ficha y guardarla sin
   * tocar la cédula la acusaría de duplicada contra sí misma, y el formulario no se podría
   * guardar sin cambiarla — que es justo lo contrario de lo que hace falta al corregir el cargo.
   */
  selfId?: string;
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
    // El `selfId === undefined` NO se puede omitir: sin él, un alta (que no lo trae) contra una
    // nómina cuyas entradas tampoco traen `id` compararía `undefined !== undefined`, saltándose
    // TODOS los duplicados en silencio.
    const clash = context.existing?.find(
      (line) =>
        line.idCard.trim() === idCard &&
        (context.selfId === undefined || line.id !== context.selfId),
    );
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

  return errors;
}

/**
 * El formulario ya validado, como la ficha que `db.ts` escribe. No lleva `id` ni `periodId`: los
 * estampa la puerta, igual que con `copyRoster` y con el importador.
 *
 * **`capture` queda SIEMPRE ausente**, y eso es lo correcto: lo único que este formulario tenía
 * del mes era el importe aprobado de horas extras, y ya no lo pide. Un empleado dado de alta a
 * mano nace por tanto exactamente igual que uno copiado del mes anterior — sin captura, no con
 * una captura en ceros, que no es lo mismo: la segunda haría que la pantalla pintara un mes que
 * nadie declaró.
 *
 * Sin captura no hay `PAGADO` declarado, así que el empleado nace «sin conciliar» — que es
 * exactamente lo que es. En cuanto alguien teclee lo transferido, concilia contra el rol que el
 * motor calcula, sin ningún archivo de por medio.
 */
export function toEmployeeLine(values: EmployeeFormValues): ParsedPayrollEmployeeLine {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    area: values.area,
    baseSalary: values.baseSalary ?? 0,
    contractType: values.contractType,
    idCard: values.idCard.trim(),
    hireDate: values.hireDate === "" ? null : values.hireDate,
    sectorCode: values.sectorCode.trim(),
    ...reserveFundFlags(values.reserveFund),
    provisionsThirteenth: values.provisionsThirteenth,
    provisionsFourteenth: values.provisionsFourteenth,
    days: values.days ?? 0,
  };
}

/**
 * La ficha guardada, de vuelta al formulario: lo que siembra el modo EDICIÓN.
 *
 * `days` y `baseSalary` se siembran aunque la edición no los pinte, para que UN solo tipo de
 * valores y UNA sola validación sirvan a los dos modos — dos formularios distintos podrían
 * separarse en qué exigen. `toEmployeePatch` es quien decide que no se escriban.
 */
export function employeeFormFrom(line: PayrollEmployeeLine): EmployeeFormValues {
  return {
    name: line.name,
    idCard: line.idCard,
    role: line.role,
    area: line.area,
    baseSalary: line.baseSalary,
    days: line.days,
    contractType: line.contractType,
    reserveFund: reserveFundMode(line),
    hireDate: line.hireDate ?? "",
    sectorCode: line.sectorCode,
    provisionsThirteenth: line.provisionsThirteenth,
    provisionsFourteenth: line.provisionsFourteenth,
  };
}

/** Lo que una edición de ficha escribe. Es `Partial` por el fondo de reserva — ver abajo. */
export type EmployeePatch = Partial<
  Pick<
    PayrollEmployeeLine,
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
 * El formulario ya validado, como el parche que una edición escribe.
 *
 * **No lleva `days` ni `baseSalary`**, aunque el formulario los tenga: los dos se editan en línea
 * en la pantalla del mes, donde se ve moverse el líquido al corregirlos, y una segunda puerta a
 * los mismos campos sería un sitio más donde decir otra cosa. En el ALTA sí viajan, porque ahí no
 * hay ficha previa de la que salir.
 *
 * **Las dos banderas del fondo de reserva solo se escriben si el MODO cambió**, y eso no es una
 * optimización: la traducción de `reserve-fund.ts` es asimétrica a propósito —`(FR=N, AC FR=S)` se
 * lee «sin derecho» y volvería como `(N, N)`— y MORALES MENA SILVIA JIMENA trae exactamente esa
 * combinación en el rol real de marzo 2026. Escribirlas siempre corregiría, al guardar cualquier
 * otro campo, un archivo que nadie pidió corregir: las cifras no se moverían (con `FR=N` las dos
 * ramas dan cero) pero el Excel descargado dejaría de coincidir con el que entró.
 */
export function toEmployeePatch(
  values: EmployeeFormValues,
  original: Pick<PayrollEmployeeLine, "hasReserveFund" | "accumulatesReserveFund">,
): EmployeePatch {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    area: values.area,
    contractType: values.contractType,
    idCard: values.idCard.trim(),
    hireDate: values.hireDate === "" ? null : values.hireDate,
    sectorCode: values.sectorCode.trim(),
    ...(reserveFundMode(original) === values.reserveFund
      ? {}
      : reserveFundFlags(values.reserveFund)),
    provisionsThirteenth: values.provisionsThirteenth,
    provisionsFourteenth: values.provisionsFourteenth,
  };
}
