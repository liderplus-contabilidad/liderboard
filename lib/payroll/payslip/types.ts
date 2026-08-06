/**
 * EL COMPROBANTE COMO DATO PLANO, y las cajas en las que se dibuja.
 *
 * `PayslipDocument` es la hoja `INDIVIDUAL` del libro del contador reducida a texto: sus líneas de
 * encabezado, sus campos de identidad, sus 26 filas con el importe YA formateado, sus tres totales
 * y su pie. Que los importes lleguen aquí como cadenas es deliberado — es lo que permite afirmar
 * en un test que un cero se imprime `-` y que un total lleva `US$`, comparando cadenas contra el
 * Excel en vez de números contra otro cálculo.
 *
 * `PayslipBox` es ese documento ya colocado: una caja por texto, con su posición, su cuerpo y su
 * alineación. `render.ts` las recorre y las dibuja sin decidir nada.
 */

/** Una fila de concepto del comprobante. `quantity` es la columna `Cantidad`, que solo llenan las
 *  tres de horas extras (con el número de horas) y las dos marcadas `(*)`. */
export interface PayslipRow {
  /** El código del catálogo. No se imprime: está para que un test nombre la fila que falla. */
  code: string;
  label: string;
  /** `null` en las 21 filas que no la usan. */
  quantity: string | null;
  value: string;
}

export interface PayslipDocument {
  /** Fila 1 del comprobante: la empresa. */
  company: string;
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
  incomes: readonly PayslipRow[];
  deductions: readonly PayslipRow[];
  /** `US$567.98` */
  totalIncome: string;
  /** `US$246.04` */
  totalDeductions: string;
  /** `US$321.94` */
  netPay: string;
  /** `C.C. 1723220065` */
  idCardLine: string;
}

export type PayslipAlign = "left" | "right";

export interface PayslipBox {
  text: string;
  /** Puntos desde el borde IZQUIERDO de la página. Con `align: "right"` es el borde derecho de la
   *  caja, no el izquierdo. */
  x: number;
  /** Puntos desde el borde SUPERIOR de la página — al revés que pdf-lib, que mide desde abajo.
   *  La conversión la hace `render.ts`, que es donde vive el sistema de coordenadas del formato;
   *  aquí se cuenta hacia abajo porque es como se lee un comprobante. */
  y: number;
  size: number;
  bold: boolean;
  align: PayslipAlign;
}

/** Una línea horizontal del comprobante (la separación de un bloque, la raya de la firma). */
export interface PayslipRule {
  x1: number;
  x2: number;
  y: number;
}

export interface PayslipPage {
  boxes: readonly PayslipBox[];
  rules: readonly PayslipRule[];
}

/** Mide un texto en puntos. Se inyecta para que la capa de geometría no importe `pdf-lib`:
 *  `render.ts` le pasa `font.widthOfTextAtSize` y el test, un medidor de anchos conocidos. */
export type MeasureText = (text: string, size: number, bold: boolean) => number;
