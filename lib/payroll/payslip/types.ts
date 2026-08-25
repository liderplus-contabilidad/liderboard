/**
 * EL COMPROBANTE COMO DATO PLANO, y las cajas en las que se dibuja.
 *
 * `PayslipDocument` es la hoja `INDIVIDUAL` del libro del contador reducida a texto: sus líneas de
 * encabezado, sus campos de identidad, sus filas con el importe YA formateado, sus tres totales
 * y su pie. Que los importes lleguen aquí como cadenas es deliberado — es lo que permite afirmar
 * en un test que un cero se imprime `-` y que un total lleva `US$`, comparando cadenas contra el
 * Excel en vez de números contra otro cálculo.
 *
 * `PayslipBox` es ese documento ya colocado: una caja por texto, con su posición, su cuerpo y su
 * alineación. `render.ts` las recorre y las dibuja sin decidir nada.
 */
import type { EntityLogo } from "@/lib/logos";

/** Una fila de concepto del comprobante. `quantity` es la columna `Cantidad`, que solo llenan las
 *  tres de horas extras (con el número de horas) y las dos marcadas `(*)`. */
export interface PayslipRow {
  /** El código del catálogo. No se imprime: está para que un test nombre la fila que falla. */
  code: string;
  label: string;
  /** `null` en las filas que no la usan, que son casi todas. */
  quantity: string | null;
  value: string;
}

export interface PayslipDocument {
  /** Fila 1 del comprobante: la empresa, y su centro de costo si lo declaró —«Delicmar · Planta
   *  Ambato», ya compuesto por `costCenterHeading`. */
  company: string;
  /**
   * El logo que encabeza a la IZQUIERDA, delante de `company`: el del cliente. Quién ocupa cada
   * lado ya lo decidió `letterheadLogos`, que es la única regla de eso en la app: este documento no
   * vuelve a preguntarlo, y por eso el layout no tiene que saber que los centros de costo existen.
   */
  logo?: EntityLogo;
  /** El de la DERECHA, arriba del título: el del centro de costo. Ausente en todo cliente que no
   *  declare uno con logo, que es lo que deja su comprobante como estaba. */
  rightLogo?: EntityLogo;
  /**
   * El membrete bajo el nombre: razón social, ubicación, teléfonos y correo, YA compuestos por
   * `letterheadLines`. Llegan como líneas y no como campos por lo mismo que los importes llegan
   * formateados — este documento es texto plano, y componer aquí una dirección abriría una segunda
   * versión de cómo se escribe, capaz de separarse de la de la pantalla y la del Excel.
   *
   * Vacío cuando el cliente no tiene perfil, y entonces el encabezado queda como estaba.
   */
  companyLines: readonly string[];
  /** `ROL DE PAGOS` */
  title: string;
  /** `MES: MARZO 2026` */
  period: string;
  /** `Codigo: 6` */
  codeLine: string;
  /** `Dias Trabajados: 30` */
  daysLine: string;
  /** `FR=0` */
  reserveFundLine: string;
  employeeName: string;
  role: string;
  /** Solo las filas CON importe, en el orden de columnas del libro. */
  incomes: readonly PayslipRow[];
  deductions: readonly PayslipRow[];
  /** La nota que explica el `(*)`, o `null` cuando ninguna fila impresa lo lleva. Se decide aquí y
   *  no en el layout porque depende de qué filas sobrevivieron a la omisión. */
  footnote: string | null;
  /** `US$567.98` */
  totalIncome: string;
  /** `US$246.04` */
  totalDeductions: string;
  /** `US$321.94` */
  netPay: string;
  /** `C.C. 1723220065` */
  idCardLine: string;
}

export type PayslipAlign = "left" | "right" | "center";

export interface PayslipBox {
  text: string;
  /** Puntos desde el borde IZQUIERDO de la página. Con `align: "right"` es el borde derecho de la
   *  caja, y con `align: "center"`, su eje. */
  x: number;
  /** Puntos desde el borde SUPERIOR de la página — al revés que pdf-lib, que mide desde abajo.
   *  La conversión la hace `render.ts`, que es donde vive el sistema de coordenadas del formato;
   *  aquí se cuenta hacia abajo porque es como se lee un comprobante. */
  y: number;
  size: number;
  bold: boolean;
  align: PayslipAlign;
  /** Hex de `palette.ts`. */
  color: string;
}

/** Una línea horizontal del comprobante (la separación de un bloque, la raya de la firma). */
export interface PayslipRule {
  x1: number;
  x2: number;
  y: number;
  thickness: number;
  color: string;
}

/** Un rectángulo de fondo: la banda de una sección, el panel de identidad, la franja alterna de
 *  una fila. Se dibujan TODOS antes que el texto, así que ninguno puede taparlo. */
export interface PayslipFill {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/**
 * El logo del cliente, ya colocado. Es la única primitiva que no es texto ni geometría plana, y
 * llega hasta aquí con su tamaño YA resuelto: `layout.ts` lo calcula de las dimensiones que el logo
 * trae guardadas, así que colocarlo no obliga a decodificar la imagen — que es lo que permite
 * afirmar en un test que no invade el bloque de la empresa sin generar ningún PDF.
 */
export interface PayslipImage {
  dataUrl: string;
  /** Lo que decide entre `embedPng` y `embedJpg` en `render.ts`. */
  mime: "image/png" | "image/jpeg";
  x: number;
  /** Puntos desde el borde SUPERIOR, como el resto de esta capa. */
  y: number;
  width: number;
  height: number;
}

export interface PayslipPage {
  fills: readonly PayslipFill[];
  rules: readonly PayslipRule[];
  /** Vacío salvo que el cliente tenga logo. Se dibujan junto a los rellenos, antes que el texto. */
  images: readonly PayslipImage[];
  boxes: readonly PayslipBox[];
}

/** Mide un texto en puntos. Se inyecta para que la capa de geometría no importe `pdf-lib`:
 *  `render.ts` le pasa `font.widthOfTextAtSize` y el test, un medidor de anchos conocidos. */
export type MeasureText = (text: string, size: number, bold: boolean) => number;
