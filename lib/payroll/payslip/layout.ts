/**
 * DÓNDE CAE CADA TEXTO DEL COMPROBANTE — puro, y por eso testeable.
 *
 * Recibe un `PayslipDocument` y devuelve cajas colocadas. `render.ts` las dibuja sin decidir nada,
 * que es lo que permite afirmar aquí —sin generar un PDF— que ninguna se sale de la hoja y que el
 * importe más largo cabe en su columna.
 *
 * **Las proporciones son las del Excel; el tamaño no.** El bloque original mide 355 px (`B`–`G` a
 * 96 dpi = 266 pt): las columnas `H` e `I` que el `Print_Area` incluye son el CANAL entre las dos
 * copias que el contador imprime lado a lado, y no llevan nada. 266 pt en una A4 de 595 es menos
 * de la mitad de la hoja, y a esa escala el rótulo más largo —`PRESTAMOS QUIROGRAFARIOS E
 * HIPOTECARIOS`, 24.5 em de Helvetica— pediría un cuerpo de 6 pt. Así que se conserva la razón
 * entre las tres columnas (163 : 84 : 108) estirada al ancho útil, y la TIPOGRAFÍA no se escala
 * con ella: escalarla 1.82× daría 18 pt y un comprobante que parece un cartel.
 *
 * **El rótulo se extiende hasta donde el Excel lo deja extenderse.** En la hoja, un rótulo largo
 * desborda hacia las celdas vacías de su derecha — por eso los 39 caracteres de `PRESTAMOS
 * QUIROGRAFARIOS E HIPOTECARIOS` caben en una columna de 122 pt. Solo cinco filas tienen algo en
 * `Cantidad` (las tres de horas extras y las dos marcadas `(*)`) y las cinco tienen rótulo corto.
 * Aquí eso se escribe como REGLA en vez de heredarse del accidente de qué celdas quedaron vacías:
 * una fila con `Cantidad` ajusta su rótulo al inicio de esa columna, una sin ella llega hasta el
 * inicio de `Valores`.
 */
import { PAYSLIP_DECLARATION, PAYSLIP_FOOTNOTE, PAYSLIP_SIGNATURE_CAPTION } from "./document";
import type {
  MeasureText,
  PayslipBox,
  PayslipDocument,
  PayslipPage,
  PayslipRow,
  PayslipRule,
} from "./types";

/** A4 vertical en puntos. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

const MARGIN_X = 56;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 40;

/** Las tres columnas del Excel en px (`B`–`D`, `E`–`F`, `G`), que es lo único que se conserva. */
const COLUMN_RATIO = { label: 163, quantity: 84, value: 108 } as const;

const BODY_SIZE = 9;
/** Los escalones a los que baja un texto que no cabe, antes de truncarse. */
const SIZE_STEPS = [9, 8, 7] as const;
const TITLE_SIZE = 11;
const HEADING_SIZE = 9.5;
const FOOTNOTE_SIZE = 7.5;

const ROW_PITCH = 12.5;
const BLOCK_GAP = 8;

const ELLIPSIS = "…";

const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
const ratioTotal = COLUMN_RATIO.label + COLUMN_RATIO.quantity + COLUMN_RATIO.value;
const scale = contentWidth / ratioTotal;

/** Bordes verticales de las tres columnas, en puntos desde el borde izquierdo de la página. */
const X_LEFT = MARGIN_X;
const X_QUANTITY_END = MARGIN_X + (COLUMN_RATIO.label + COLUMN_RATIO.quantity) * scale;
const X_QUANTITY_START = MARGIN_X + COLUMN_RATIO.label * scale;
const X_RIGHT = MARGIN_X + contentWidth;

/** Recorta un texto al ancho dado, bajando de cuerpo antes de truncar. */
function fit(
  text: string,
  maxWidth: number,
  bold: boolean,
  measure: MeasureText,
): { text: string; size: number } {
  for (const size of SIZE_STEPS) {
    if (measure(text, size, bold) <= maxWidth) {
      return { text, size };
    }
  }

  // Ya en el cuerpo más pequeño: se recorta carácter a carácter dejando sitio para la elipsis.
  const size = SIZE_STEPS[SIZE_STEPS.length - 1];
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}${ELLIPSIS}`, size, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}${ELLIPSIS}`, size };
}

/** Parte un texto en las líneas que quepan en `maxWidth`, por palabras. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  measure: MeasureText,
): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, size, bold) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Coloca un comprobante en una página A4 vertical.
 *
 * Devuelve además `overflow`, que es `true` si el contenido no cupo en el alto útil. Lo declara en
 * vez de recortar en silencio: un comprobante cortado por abajo pierde la línea de firma, que es
 * justamente para lo que existe el papel.
 */
export function layoutPayslip(
  document: PayslipDocument,
  measure: MeasureText,
): PayslipPage & { overflow: boolean } {
  const boxes: PayslipBox[] = [];
  const rules: PayslipRule[] = [];
  let y = MARGIN_TOP;

  const push = (
    text: string,
    x: number,
    size: number,
    bold: boolean,
    align: PayslipBox["align"] = "left",
  ) => {
    boxes.push({ text, x, y, size, bold, align });
  };

  // Encabezado: la empresa y el título, centrados por construcción sobre el bloque.
  const company = fit(document.company, contentWidth, true, measure);
  push(company.text, X_LEFT, company.size, true);
  y += ROW_PITCH + 2;

  push(document.title, X_RIGHT, TITLE_SIZE, true, "right");
  y += ROW_PITCH;
  push(document.period, X_RIGHT, HEADING_SIZE, true, "right");
  y += ROW_PITCH + BLOCK_GAP;

  // Identidad. `Codigo:` y `Dias Trabajados:` comparten fila, como en el libro (`B5` y `E5`).
  push(document.codeLine, X_LEFT, BODY_SIZE, false);
  push(document.daysLine, X_RIGHT, BODY_SIZE, false, "right");
  y += ROW_PITCH;

  // Se ajusta la línea ENTERA, con su prefijo: ajustar solo el nombre y anteponer `Empleado: `
  // después lo empujaría fuera de la hoja justo en el caso que el ajuste existe para evitar.
  const name = fit(`Empleado: ${document.employeeName}`, contentWidth, false, measure);
  push(name.text, X_LEFT, name.size, false);
  y += ROW_PITCH;

  // El cargo comparte fila con `FR=`, que va a la derecha (`D7` y `G7`).
  const roleWidth = X_RIGHT - X_LEFT - measure(document.reserveFundLine, BODY_SIZE, false) - 12;
  const role = fit(`Cargo: ${document.role}`, roleWidth, false, measure);
  push(role.text, X_LEFT, role.size, false);
  push(document.reserveFundLine, X_RIGHT, BODY_SIZE, false, "right");
  y += ROW_PITCH + BLOCK_GAP;

  const sectionHeader = (left: string, quantity: string | null, value: string) => {
    push(left, X_LEFT, HEADING_SIZE, true);
    if (quantity) {
      push(quantity, X_QUANTITY_END, HEADING_SIZE, true, "right");
    }
    push(value, X_RIGHT, HEADING_SIZE, true, "right");
    y += ROW_PITCH;
    rules.push({ x1: X_LEFT, x2: X_RIGHT, y: y - ROW_PITCH + 3 });
  };

  const conceptRow = (row: PayslipRow) => {
    // Aquí vive la regla del desbordamiento: con `Cantidad` el rótulo se para en esa columna, sin
    // ella llega hasta `Valores`. Es lo que el Excel hace por su cuenta al desbordar hacia celdas
    // vacías, escrito como decisión.
    const limit = row.quantity === null ? X_QUANTITY_END : X_QUANTITY_START;
    const label = fit(row.label, limit - X_LEFT - 6, false, measure);
    push(label.text, X_LEFT, label.size, false);
    if (row.quantity !== null) {
      push(row.quantity, X_QUANTITY_END, BODY_SIZE, false, "right");
    }
    push(row.value, X_RIGHT, BODY_SIZE, false, "right");
    y += ROW_PITCH;
  };

  const totalRow = (label: string, value: string) => {
    rules.push({ x1: X_LEFT, x2: X_RIGHT, y: y - 2 });
    push(label, X_LEFT, HEADING_SIZE, true);
    push(value, X_RIGHT, HEADING_SIZE, true, "right");
    y += ROW_PITCH;
  };

  sectionHeader("INGRESOS", "Cantidad", "Valores");
  document.incomes.forEach(conceptRow);
  totalRow("TOTAL DE INGRESOS:", document.totalIncome);
  y += BLOCK_GAP;

  sectionHeader("EGRESOS:", null, "Valores");
  document.deductions.forEach(conceptRow);
  totalRow("TOTAL DE EGRESOS:", document.totalDeductions);
  totalRow("LIQUIDO A RECIBIR:", document.netPay);
  y += BLOCK_GAP;

  // El pie. La declaración son ~168 caracteres que en la hoja van a una celda combinada de 355 px
  // donde no caben: aquí se parte en líneas, que es una MEJORA sobre el original.
  push(PAYSLIP_FOOTNOTE, X_LEFT, FOOTNOTE_SIZE, false);
  y += ROW_PITCH;

  for (const line of wrapText(PAYSLIP_DECLARATION, contentWidth, FOOTNOTE_SIZE, false, measure)) {
    push(line, X_LEFT, FOOTNOTE_SIZE, false);
    y += FOOTNOTE_SIZE + 2.5;
  }

  y += ROW_PITCH * 2;
  push("_____________________________", X_LEFT, BODY_SIZE, false);
  y += ROW_PITCH;
  push(PAYSLIP_SIGNATURE_CAPTION, X_LEFT, BODY_SIZE, false);
  y += ROW_PITCH;
  push(document.idCardLine, X_LEFT, BODY_SIZE, false);

  return { boxes, rules, overflow: y > PAGE_HEIGHT - MARGIN_BOTTOM };
}

/** Los bordes de las columnas, para que el test afirme sobre ellos sin re-derivarlos. */
export const PAYSLIP_COLUMNS = {
  left: X_LEFT,
  quantityStart: X_QUANTITY_START,
  quantityEnd: X_QUANTITY_END,
  right: X_RIGHT,
} as const;
