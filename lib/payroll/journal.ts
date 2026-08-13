/**
 * El ASIENTO CONTABLE del período: el catálogo fijo de cuentas que el rol de pagos genera cada
 * mes (sacado de las filas `GENERAL!43-71` del Excel del contador — la versión que CUADRA, no la de
 * la hoja `ASIENTOS`) y las derivaciones puras sobre él. Los importes llegan por parámetro; quien
 * los produce es `journal-amounts.ts`, sumando la nómina entera del período a través del motor.
 *
 * Son **26** cuentas: las 24 del libro y dos que añade esta app —`seguro-privado`, sin la cual el
 * asiento descuadra por el importe de `Q`, y `bonos-aportables`, sin la cual descuadra por los
 * conceptos de ingreso extra aportables que un período declare—. El porqué, con el álgebra, está
 * en la entrada de cada una; las dos están pendientes de confirmar con la firma.
 *
 * Dos de sus `sourceColumns` NO son columnas del libro sino pseudo-columnas (`EXTRA_AP`,
 * `EXTRA_NA`): los conceptos extra no tienen sitio en la hoja `GENERAL`, y darles el nombre de una
 * columna que sí existe haría creer al contador que puede cotejarlas contra ella.
 *
 * Por qué la clave de una cuenta es `id` y no `code`: `621001` aparece DOS VECES en el catálogo
 * (el gasto de sueldos en el `debe`, `GENERAL!C44`, y en el `haber` las licencias/permisos/tiempo
 * parcial, `GENERAL!D44` — el libro las pone en la misma fila, una en cada columna) y dos cuentas más no traen código ninguno
 * (`Viaticos`, `Impuesto a la Renta Empleados`). Si la clave fuera `code`, las dos filas de
 * `621001` colapsarían en una y las dos sin código quedarían sin ninguna clave. `code: null`
 * significa «el plan del contador no le asignó código» — no «falta por poner», y no debe
 * rellenarse con uno inventado.
 *
 * `sourceColumns` declara qué columnas del rol componen cada cuenta, y **es lo que el asiento
 * ejecuta**: `journal-amounts.ts` lo RECORRE para sumar. No es documentación al lado del código
 * —eso fue mientras la conexión no existía—, y esa es la razón de que siga siendo un dato del
 * catálogo: una segunda lista de sumas escrita a mano por cuenta podría separarse de esta anotación
 * sin que nada lo delate, y entonces el catálogo diría una cosa mientras el asiento hace otra.
 * Recorriéndola, la única forma de equivocarse es equivocarse aquí, que es lo que el contador puede
 * revisar contra su hoja.
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
    // `EXTRA_NA` son los conceptos extra NO APORTABLES que el período declare. Van aquí y no a una
    // cuenta propia porque esta cuenta ES exactamente eso: el destino del bono que no aporta.
    // Sumárselos dice la verdad en vez de abrir una segunda cuenta para lo mismo.
    sourceColumns: ["V", "EXTRA_NA"],
  },
  {
    id: "bonos-aportables",
    code: null,
    name: "Bonos Aportables",
    side: "debe",
    // ⚠ La SEGUNDA cuenta que no sale de `GENERAL!43-71`, por el mismo álgebra que `seguro-privado`
    // (abajo): un concepto extra APORTABLE entra en `W` y le llega al empleado por el haber dentro
    // de `AP`, así que sin destino en el debe el asiento descuadraría por su importe. Sus efectos
    // sobre `X`, `AU`, `AS`, `AV` y `AW` sí los recogen las cuentas que ya leen esas columnas, así
    // que esta solo tiene que cubrir el ingreso en sí.
    //
    // Sin código, el mismo trato que `Viaticos` y `Seguro Privado`. **Pendiente de confirmar con la
    // firma**: si prefieren repartirlo entre cuentas existentes —`Comisiones Administracion`, o una
    // por concepto— se cambia esta entrada y su fila del mapa de `journal-amounts.ts`.
    sourceColumns: ["EXTRA_AP"],
  },
  {
    id: "seguro-privado",
    code: null,
    name: "Seguro Privado",
    side: "debe",
    // ⚠ La ÚNICA cuenta del catálogo que NO sale de `GENERAL!43-71`. La añade esta app, y existe
    // porque sin ella el asiento DESCUADRA por el importe del seguro privado:
    //
    //   Debe  = F+M+S+T+AS+O+AT+N+AV+P+AU+AW+U+R+V  = (W − Q) + AS+AT+AV+AU+AW
    //   Haber = (Z+AN+AI)+AP+AS+AT+AV+AA+AE+AD
    //         + (X+AU+Y+AW)+AB+AC+AF+AG+AH           =  W      + AS+AT+AV+AU+AW
    //
    // `Q` entra en `W` (el ingreso), le llega al empleado por el haber dentro de `AP` (el líquido),
    // y ninguna de las 24 cuentas del libro la recoge por el debe: Haber − Debe = Q. En el archivo
    // real de marzo `Q` vale cero, y por eso el descuadre no se ve ahí.
    //
    // Va al DEBE porque es lo que la columna significa —la empresa paga un seguro como beneficio:
    // es un GASTO que llega al líquido del empleado— y porque es donde el álgebra dice que falta.
    // Sin código, el mismo trato que `Viaticos`: el plan del contador tampoco le asignó uno.
    //
    // **Pendiente de confirmar con la firma.** Si prefieren otro destino para `Q`, se cambia esta
    // entrada y su fila del mapa de `journal-amounts.ts`; nada más depende de ella.
    sourceColumns: ["Q"],
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
