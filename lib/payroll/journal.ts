/**
 * El ASIENTO CONTABLE del período: el catálogo fijo de cuentas que el rol de pagos genera cada
 * mes (sacado tal cual de las filas `GENERAL!43-71` del Excel del contador — la versión que
 * CUADRA, no la de la hoja `ASIENTOS`) y las derivaciones puras sobre él. Los importes de cada
 * cuenta llegan por parámetro, desde `GENERAL!39`, a través de las fórmulas que cada fila del
 * asiento suma; este archivo no sabe todavía cómo se llega ahí — esa conexión con las cifras
 * reales del período es de otra ronda.
 *
 * Por qué la clave de una cuenta es `id` y no `code`: `621001` aparece DOS VECES en el catálogo
 * (el gasto de sueldos en el `debe`, `GENERAL!C44`, y en el `haber` las licencias/permisos/tiempo
 * parcial, `GENERAL!D44` — el libro las pone en la misma fila, una en cada columna) y dos cuentas más no traen código ninguno
 * (`Viaticos`, `Impuesto a la Renta Empleados`). Si la clave fuera `code`, las dos filas de
 * `621001` colapsarían en una y las dos sin código quedarían sin ninguna clave. `code: null`
 * significa «el plan del contador no le asignó código» — no «falta por poner», y no debe
 * rellenarse con uno inventado.
 *
 * `sourceColumns` documenta qué columnas de `GENERAL!39` suma el Excel del contador para llegar al
 * importe de esa cuenta. Nadie las lee todavía: es el mapa dejado por escrito mientras el archivo
 * estaba delante, para cuando el asiento se alimente de las cifras reales del período. Van como
 * dato y no como función porque el tipo de esos totales aún no existe y no debe inventarse aquí.
 */
import { sameToTheCentavo } from "./amounts";

export type JournalSide = "debe" | "haber";

export interface JournalAccount {
  id: string;
  code: string | null;
  name: string;
  side: JournalSide;
  sourceColumns: readonly string[];
}

/**
 * Las 24 cuentas del asiento, en el orden en que las lista `GENERAL!43-71`: primero el `debe` (10
 * cuentas de gasto de administración), luego el `haber` (14 cuentas por pagar/retener). Los
 * `name` van VERBATIM, erratas incluidas («Anticpo Empleados», «Vacaciones Pagar») — son los
 * rótulos con los que el contador coteja la pantalla contra su hoja, y corregirlos rompe ese
 * cotejo sin ganar nada.
 *
 * `as const satisfies readonly JournalAccount[]` comprueba la forma sin ensanchar los literales:
 * si se anotara la constante como `: readonly JournalAccount[]`, cada `id` pasaría a ser `string`
 * y `JournalAccountId` (abajo) no podría acotarse a las 24 claves reales.
 */
export const JOURNAL_ACCOUNTS = [
  // --- Debe: 10 cuentas de gasto de administración (GENERAL!44-53) ---
  {
    id: "sueldos-administracion",
    code: "621001",
    name: "Sueldos Administracion",
    side: "debe",
    sourceColumns: ["F"],
  },
  {
    id: "horas-extras-administracion",
    code: "621002",
    name: "Horas Extras Administracion",
    side: "debe",
    sourceColumns: ["M"],
  },
  {
    id: "comisiones-administracion",
    code: "621003",
    name: "Comisiones Administracion",
    side: "debe",
    // La de `ASIENTOS` suma Q+R+S+T; la corregida solo S+T — Q y R son otras columnas del rol.
    sourceColumns: ["S", "T"],
  },
  {
    id: "decimo-tercer-sueldo-administracion",
    code: "621004",
    name: "Decimo 3er Sueldo Administr.",
    side: "debe",
    sourceColumns: ["AS", "O"],
  },
  {
    id: "decimo-cuarto-sueldo-administracion",
    code: "621005",
    name: "Decimo 4to Sueldo Administr.",
    side: "debe",
    sourceColumns: ["AT", "N"],
  },
  {
    id: "vacaciones-administracion",
    code: "621006",
    name: "Vacaciones Administracion",
    side: "debe",
    sourceColumns: ["AV", "P"],
  },
  {
    id: "aporte-patronal-iess-administracion",
    code: "621007",
    name: "Aporte patronal IESS Administr.",
    side: "debe",
    sourceColumns: ["AU"],
  },
  {
    id: "fondo-reserva-iess-administracion",
    code: "621008",
    name: "Fondo Reserva IESS Administr.",
    side: "debe",
    sourceColumns: ["AW", "U"],
  },
  {
    id: "viaticos",
    code: null,
    name: "Viaticos",
    side: "debe",
    // La de `ASIENTOS` lee `V` (la columna del Bono ND, de abajo); la corregida lee `R`.
    sourceColumns: ["R"],
  },
  {
    id: "bono-nd",
    // `GENERAL!A53` trae literalmente `6`, no un código `6210xx`. Va verbatim: inventarle un
    // código sería adivinar, y ponerlo en `null` borraría la evidencia de que ahí hay algo por
    // preguntarle al contador.
    code: "6",
    name: "Bono ND",
    side: "debe",
    sourceColumns: ["V"],
  },
  // --- Haber: 14 cuentas por pagar/retener (GENERAL!44,54-60,63,66-70) ---
  {
    id: "licencias-permisos-tiempo-parcial",
    code: "621001",
    // Sin nombre propio en la hoja: este crédito (`GENERAL!D44 = Z39+AN39+AI39`) comparte fila
    // con el débito de `621001` de arriba, así que la columna del nombre ya la ocupa «Sueldos
    // Administracion». Las tres columnas que lo componen: `Z` (LICENCIA SIN SUELDO), `AN`
    // (Descuento PERMISO MEDICO) y `AI` (DESCUENTO TIEMPO PACIAL). Es lo que hace que el asiento
    // cuadre cuando entra un empleado a tiempo parcial — la versión de `ASIENTOS` no les daba
    // destino y por eso descuadraba.
    name: "Licencias, permisos y tiempo parcial",
    side: "haber",
    sourceColumns: ["Z", "AN", "AI"],
  },
  {
    id: "sueldos-por-pagar",
    code: "213001",
    name: "Sueldos por Pagar",
    side: "haber",
    sourceColumns: ["AP"],
  },
  {
    id: "decimo-tercer-sueldo-por-pagar",
    code: "213003",
    name: "Decimo Tercer Sueldo por Pagar",
    side: "haber",
    sourceColumns: ["AS"],
  },
  {
    id: "decimo-cuarto-sueldo-por-pagar",
    code: "213004",
    name: "Decimo Cuarto Sueldo por Pagar",
    side: "haber",
    sourceColumns: ["AT"],
  },
  {
    id: "vacaciones-por-pagar",
    code: "213005",
    name: "Vacaciones Pagar",
    side: "haber",
    sourceColumns: ["AV"],
  },
  {
    id: "anticipo-empleados",
    code: "1.1.2.8.1",
    name: "Anticpo Empleados",
    side: "haber",
    sourceColumns: ["AA"],
  },
  {
    id: "multas-empleados",
    code: "213009",
    name: "Multas Empleados",
    side: "haber",
    sourceColumns: ["AE"],
  },
  {
    id: "almuerzos",
    code: "218003",
    name: "Almuerzos",
    side: "haber",
    sourceColumns: ["AD"],
  },
  {
    id: "aportes-iess-por-pagar",
    code: "2.1.7.1.9",
    // Funde en una sola cuenta las CUATRO que la hoja anula justo debajo (`GENERAL!61,62,64,65`:
    // dos aportes IESS 214001 al 9.45% y al 12.15%, `214002 Prestamos IESS por Pagar` y `214003
    // Fondo Reserva IESS por Pagar`), cada una con su fórmula multiplicada por cero. No entran al
    // catálogo — serían cuatro filas que nunca pueden llevar cifra, y `214002` chocaría de código
    // con «Prestamos Empresariales» de abajo, que sí está viva. `GENERAL!E61 = SUM(D61:D65)`
    // confirma que esta cuenta vale exactamente lo que las cuatro juntas: X + AU + Y + AW.
    name: "Aportes IESS por Pagar",
    side: "haber",
    sourceColumns: ["X", "AU", "Y", "AW"],
  },
  {
    id: "prestamos-empresariales",
    code: "214002",
    name: "Prestamos Empresariales",
    side: "haber",
    sourceColumns: ["AB"],
  },
  {
    id: "impuesto-renta-empleados",
    code: null,
    name: "Impuesto a la Renta Empleados",
    side: "haber",
    sourceColumns: ["AC"],
  },
  {
    id: "consumo-locales-empleados",
    code: "2.1.7.7.6",
    name: "Consumo en Locales / Empleados",
    side: "haber",
    sourceColumns: ["AF"],
  },
  {
    id: "contribucion-solidaria",
    code: "218006",
    name: "Contribución Solidaria",
    side: "haber",
    sourceColumns: ["AG"],
  },
  {
    id: "otros-descuentos",
    code: "218007",
    name: "Otros Descuentos",
    side: "haber",
    sourceColumns: ["AH"],
  },
] as const satisfies readonly JournalAccount[];

/**
 * Las 24 claves válidas de importe, derivadas del propio catálogo — nunca declaradas a mano
 * aparte, porque una segunda lista se desincroniza en cuanto el catálogo cambie.
 */
export type JournalAccountId = (typeof JOURNAL_ACCOUNTS)[number]["id"];

/**
 * Un `id` mal tecleado por quien conecte las cifras reales debe fallar en COMPILACIÓN, no en
 * pantalla: con `Record<string, number>` cualquier clave colaba, la fila correspondiente se
 * quedaba en `null` para siempre y la tarjeta decía «Descuadra» sin señalar por qué. `Partial`
 * porque un mes puede no traer cifra para alguna cuenta (así lo modela `buildJournalEntry`, más
 * abajo, tratando la ausencia como «no se sabe», no como cero).
 */
export type JournalAmounts = Partial<Record<JournalAccountId, number>>;

export interface JournalLine extends JournalAccount {
  amount: number | null;
}

export interface JournalEntry {
  lines: readonly JournalLine[];
  debit: number;
  credit: number;
  balanced: boolean;
}

/**
 * Arma el asiento completo recorriendo `JOURNAL_ACCOUNTS` en orden. Un importe ausente en
 * `amounts` es `null` — no cero: la misma distinción que ya hace `PayrollEmployeeFigures` con un
 * período que no recibió su archivo. No decir «cero» a lo que en realidad es «no se sabe» evita
 * que una fila sin dato se lea como una cuenta que de verdad no tuvo movimiento.
 */
export function buildJournalEntry(amounts: JournalAmounts): JournalEntry {
  const lines: JournalLine[] = JOURNAL_ACCOUNTS.map((account) => ({
    ...account,
    // `?? null` en vez del `Object.hasOwn` de antes: con `JournalAmounts` ya tipado por
    // `JournalAccountId`, un `undefined` solo puede venir de una clave ausente (nunca de una
    // ausente-pero-igual-presente), así que la semántica es la misma y esta forma no deja colar
    // un `undefined` que pintaría `NaN` si alguna ronda futura relajara el tipo.
    amount: amounts[account.id] ?? null,
  }));

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    // Para la SUMA un importe ausente sí cuenta como 0 — es el total del asiento hasta donde se
    // conoce, no una afirmación de que las cuentas sin dato valen cero.
    const amount = line.amount ?? 0;
    if (line.side === "debe") {
      debit += amount;
    } else {
      credit += amount;
    }
  }

  return { lines, debit, credit, balanced: sameToTheCentavo(debit, credit) };
}

/**
 * Las filas «con movimiento» del asiento: las que el usuario necesita ver. Una fila en
 * exactamente `0` se esconde porque no aporta nada a la lectura; una fila en `null` se queda —no
 * se sabe cuánto vale todavía, y esconderla sería afirmar que es cero cuando no lo es. Filtra
 * `lines`, nunca toca `debit`/`credit`: encender o apagar el interruptor no puede mover el total
 * que el usuario ya vio arriba.
 */
export function movingJournalLines(entry: JournalEntry): readonly JournalLine[] {
  return entry.lines.filter((line) => line.amount !== 0);
}
