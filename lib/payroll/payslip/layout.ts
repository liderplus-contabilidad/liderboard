/**
 * DÓNDE CAE CADA TEXTO DEL COMPROBANTE — puro, y por eso testeable.
 *
 * Recibe un `PayslipDocument` y devuelve rellenos, reglas y cajas colocadas. `render.ts` los dibuja
 * sin decidir nada, que es lo que permite afirmar aquí —sin generar un PDF— que ninguna caja se sale
 * de la hoja y que el importe más largo cabe en su columna.
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
 *
 * **La jerarquía es del DOCUMENTO, no del Excel**, y es el punto donde este comprobante se aparta
 * del libro a propósito. La hoja es una rejilla de celdas sin más; aquí hay cinco bloques con peso
 * distinto —encabezado, identidad, las dos secciones y el líquido— para que se lea de un vistazo.
 * Los colores no son inventados: salen de `palette.ts`, y los dos que mandan son los rellenos que
 * el propio contador usa para ingresos y costos en su hoja.
 */
import { fitLogoBox } from "@/lib/logos";
import { PAYSLIP_DECLARATION, PAYSLIP_FOOTNOTE, PAYSLIP_SIGNATURE_CAPTION } from "./document";
import { PAYSLIP_COLORS } from "./palette";
import type {
  MeasureText,
  PayslipBox,
  PayslipDocument,
  PayslipFill,
  PayslipImage,
  PayslipPage,
  PayslipRow,
  PayslipRule,
} from "./types";

/** A4 vertical en puntos. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 36;

/** Las tres columnas del Excel en px (`B`–`D`, `E`–`F`, `G`), que es lo único que se conserva. */
const COLUMN_RATIO = { label: 163, quantity: 84, value: 108 } as const;

const BODY_SIZE = 9;
/** Los escalones a los que baja un texto que no cabe, antes de truncarse. */
const SIZE_STEPS = [9, 8, 7] as const;
const COMPANY_SIZE = 15;
const TITLE_SIZE = 13;
const SUBTITLE_SIZE = 9;
const SECTION_SIZE = 8.5;
const TOTAL_SIZE = 9.5;
const NET_SIZE = 11.5;
const FOOTNOTE_SIZE = 7.5;

const ROW_PITCH = 12.6;
const SECTION_BAND_HEIGHT = 15;
const NET_BAND_HEIGHT = 24;
/** Aire dentro de una banda o panel, a izquierda y derecha. */
const PAD_X = 7;

const ELLIPSIS = "…";

/**
 * El hueco del logo en el encabezado. El alto es el del bloque de dos líneas (empresa + mes) para
 * que el logo no lo desborde ni por arriba ni por abajo; el ancho se queda holgadamente dentro del
 * 55% que el nombre de la empresa ya tenía asignado, así que un logo apaisado no puede empujar al
 * nombre contra el título de la derecha.
 */
const LOGO_SLOT = { width: 76, height: COMPANY_SIZE + SUBTITLE_SIZE + 4 } as const;

/** Aire entre el logo y el nombre de la empresa. */
const LOGO_GAP = 10;

const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
const ratioTotal = COLUMN_RATIO.label + COLUMN_RATIO.quantity + COLUMN_RATIO.value;
const scale = contentWidth / ratioTotal;

/** Bordes verticales de las tres columnas. Las bandas sangran su texto `PAD_X`, así que las
 *  columnas viven dentro de ese margen y ningún rótulo toca el borde de su relleno. */
const X_LEFT = MARGIN_X + PAD_X;
const X_QUANTITY_START = MARGIN_X + COLUMN_RATIO.label * scale;
const X_QUANTITY_END = MARGIN_X + (COLUMN_RATIO.label + COLUMN_RATIO.quantity) * scale;
const X_RIGHT = MARGIN_X + contentWidth - PAD_X;

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

/**
 * Recorta un texto a un ancho SIN bajar de cuerpo — para los bloques cuyo tamaño es jerarquía (el
 * nombre de la empresa, el del empleado): encogerlos rompería el escalón que los distingue.
 */
function clip(text: string, maxWidth: number, size: number, bold: boolean, measure: MeasureText) {
  if (measure(text, size, bold) <= maxWidth) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 1 && measure(`${clipped}${ELLIPSIS}`, size, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}${ELLIPSIS}`;
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
  const fills: PayslipFill[] = [];
  const rules: PayslipRule[] = [];
  const images: PayslipImage[] = [];
  const boxes: PayslipBox[] = [];
  let y = MARGIN_TOP;

  const push = (
    text: string,
    x: number,
    size: number,
    bold: boolean,
    color: string,
    align: PayslipBox["align"] = "left",
    atY: number = y,
  ) => {
    boxes.push({ text, x, y: atY, size, bold, align, color });
  };

  const band = (height: number, color: string) => {
    fills.push({ x: MARGIN_X, y, width: contentWidth, height, color });
  };

  // ── Encabezado ──────────────────────────────────────────────────────────────────────────────
  // La empresa manda; a su derecha, qué documento es y de qué mes. El mes va en su propia línea
  // bajo el título porque es lo que distingue un comprobante de otro en una carpeta con doce.
  //
  // El logo, si lo hay, va DELANTE del nombre y le cede su ancho: el nombre no se centra ni se
  // encoge, solo empieza más a la derecha, así que el escalón entre empresa y título se conserva
  // igual con logo que sin él. La caja se calcula de las dimensiones que el logo trae guardadas,
  // sin decodificar la imagen — que es lo que mantiene puro este archivo.
  const logoBox = document.logo ? fitLogoBox(document.logo, LOGO_SLOT) : null;
  if (document.logo && logoBox) {
    images.push({
      dataUrl: document.logo.dataUrl,
      mime: document.logo.mime,
      x: MARGIN_X,
      // Centrado contra las dos líneas del encabezado, no colgado de la primera: un logo apaisado
      // alineado por arriba deja un hueco bajo él que se lee como un error de composición.
      y: y + (LOGO_SLOT.height - logoBox.height) / 2,
      width: logoBox.width,
      height: logoBox.height,
    });
  }
  const companyX = logoBox ? MARGIN_X + logoBox.width + LOGO_GAP : MARGIN_X;
  push(
    clip(
      document.company,
      // Lo que le queda al nombre tras ceder el logo. El 0.55 del ancho útil era su tope cuando
      // empezaba en el margen; aquí el tope es el mismo punto de corte, no la misma anchura.
      MARGIN_X + contentWidth * 0.55 - companyX,
      COMPANY_SIZE,
      true,
      measure,
    ),
    companyX,
    COMPANY_SIZE,
    true,
    PAYSLIP_COLORS.ink,
  );
  push(document.title, MARGIN_X + contentWidth, TITLE_SIZE, true, PAYSLIP_COLORS.ink, "right");
  push(
    document.period.replace(/^MES:\s*/, ""),
    MARGIN_X + contentWidth,
    SUBTITLE_SIZE,
    false,
    PAYSLIP_COLORS.muted,
    "right",
    y + TITLE_SIZE + 4,
  );

  y += COMPANY_SIZE + SUBTITLE_SIZE + 10;
  rules.push({
    x1: MARGIN_X,
    x2: MARGIN_X + contentWidth,
    y,
    thickness: 1.2,
    color: PAYSLIP_COLORS.ink,
  });
  y += 15;

  // ── Identidad ───────────────────────────────────────────────────────────────────────────────
  // Un panel en vez de tres líneas sueltas: es la respuesta a «¿de quién es este papel?», y
  // agruparla deja que las secciones de abajo empiecen sin competir con ella.
  const panelTop = y;
  const panelHeight = 48;
  fills.push({
    x: MARGIN_X,
    y: panelTop,
    width: contentWidth,
    height: panelHeight,
    color: PAYSLIP_COLORS.panel,
  });

  const identityWidth = contentWidth * 0.58;
  let iy = panelTop + 11;
  push(
    clip(document.employeeName, identityWidth, 10.5, true, measure),
    X_LEFT,
    10.5,
    true,
    PAYSLIP_COLORS.ink,
    "left",
    iy,
  );
  push(document.codeLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.muted, "right", iy);

  iy += 14;
  push(
    clip(document.role, identityWidth, BODY_SIZE, false, measure),
    X_LEFT,
    BODY_SIZE,
    false,
    PAYSLIP_COLORS.muted,
    "left",
    iy,
  );
  push(document.daysLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.muted, "right", iy);

  iy += 12;
  push(document.reserveFundLine, X_RIGHT, 8.5, false, PAYSLIP_COLORS.faint, "right", iy);

  y = panelTop + panelHeight + 15;

  // ── Secciones ───────────────────────────────────────────────────────────────────────────────
  const sectionHeader = (title: string, quantity: string | null, color: string) => {
    band(SECTION_BAND_HEIGHT, color);
    const textY = y + 4;
    push(title, X_LEFT, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "left", textY);
    if (quantity) {
      push(quantity, X_QUANTITY_END, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "right", textY);
    }
    push("Valores", X_RIGHT, SECTION_SIZE, true, PAYSLIP_COLORS.ink, "right", textY);
    y += SECTION_BAND_HEIGHT + 5;
  };

  const conceptRow = (row: PayslipRow, index: number) => {
    // La franja alterna: 26 filas que cruzan la hoja de una punta a otra se saltan de renglón sin
    // ella. Va tan clara que en fotocopia desaparece, que es justo lo que se quiere — ayuda a
    // seguir la línea, no informa de nada.
    if (index % 2 === 1) {
      fills.push({
        x: MARGIN_X,
        y: y - 3.5,
        width: contentWidth,
        height: ROW_PITCH,
        color: PAYSLIP_COLORS.zebra,
      });
    }

    // Aquí vive la regla del desbordamiento: con `Cantidad` el rótulo se para en esa columna, sin
    // ella llega hasta `Valores`. Es lo que el Excel hace por su cuenta al desbordar hacia celdas
    // vacías, escrito como decisión.
    const limit = row.quantity === null ? X_QUANTITY_END : X_QUANTITY_START;
    const label = fit(row.label, limit - X_LEFT - 8, false, measure);
    push(label.text, X_LEFT, label.size, false, PAYSLIP_COLORS.inkSoft);

    if (row.quantity !== null) {
      push(
        row.quantity,
        X_QUANTITY_END,
        BODY_SIZE,
        false,
        row.quantity === "-" ? PAYSLIP_COLORS.faint : PAYSLIP_COLORS.muted,
        "right",
      );
    }

    // Un cero va en tinta débil: veintidós rayas a peso completo compiten con las cuatro cifras que
    // sí dicen algo, y lo que se viene a leer son esas cuatro.
    push(
      row.value,
      X_RIGHT,
      BODY_SIZE,
      false,
      row.value === "-" ? PAYSLIP_COLORS.faint : PAYSLIP_COLORS.ink,
      "right",
    );
    y += ROW_PITCH;
  };

  const totalRow = (label: string, value: string) => {
    y += 2;
    rules.push({
      x1: MARGIN_X,
      x2: MARGIN_X + contentWidth,
      y,
      thickness: 0.7,
      color: PAYSLIP_COLORS.border,
    });
    y += 7;
    push(label, X_LEFT, TOTAL_SIZE, true, PAYSLIP_COLORS.ink);
    push(value, X_RIGHT, TOTAL_SIZE, true, PAYSLIP_COLORS.ink, "right");
    y += TOTAL_SIZE + 6;
  };

  sectionHeader("INGRESOS", "Cantidad", PAYSLIP_COLORS.income);
  document.incomes.forEach(conceptRow);
  totalRow("TOTAL DE INGRESOS", document.totalIncome);
  y += 9;

  sectionHeader("EGRESOS", null, PAYSLIP_COLORS.cost);
  document.deductions.forEach(conceptRow);
  totalRow("TOTAL DE EGRESOS", document.totalDeductions);
  y += 7;

  // ── Líquido a recibir ───────────────────────────────────────────────────────────────────────
  // La cifra que todo el mundo busca, y la única sobre fondo oscuro: es el importe que el empleado
  // declara haber recibido al firmar, y no puede confundirse con los otros dos totales.
  band(NET_BAND_HEIGHT, PAYSLIP_COLORS.net);
  const netY = y + (NET_BAND_HEIGHT - NET_SIZE) / 2 + 1;
  push("LIQUIDO A RECIBIR", X_LEFT, NET_SIZE, true, PAYSLIP_COLORS.white, "left", netY);
  push(document.netPay, X_RIGHT, NET_SIZE, true, PAYSLIP_COLORS.white, "right", netY);
  y += NET_BAND_HEIGHT + 17;

  // ── Pie ─────────────────────────────────────────────────────────────────────────────────────
  // La declaración son ~168 caracteres que en la hoja van a una celda combinada de 355 px donde no
  // caben: aquí se parte en líneas, que es una MEJORA sobre el original.
  push(PAYSLIP_FOOTNOTE, MARGIN_X, FOOTNOTE_SIZE, false, PAYSLIP_COLORS.faint);
  y += 13;

  for (const line of wrapText(PAYSLIP_DECLARATION, contentWidth, FOOTNOTE_SIZE, false, measure)) {
    push(line, MARGIN_X, FOOTNOTE_SIZE, false, PAYSLIP_COLORS.muted);
    y += FOOTNOTE_SIZE + 2.5;
  }

  // La raya de la firma se DIBUJA. El libro la escribe con guiones bajos porque una celda no puede
  // trazar nada; aquí sí, y una línea de verdad no depende de cuántos `_` quepan.
  y += 42;
  rules.push({ x1: MARGIN_X, x2: MARGIN_X + 190, y, thickness: 0.7, color: PAYSLIP_COLORS.ink });
  y += 11;
  push(PAYSLIP_SIGNATURE_CAPTION, MARGIN_X, 8.5, true, PAYSLIP_COLORS.ink);
  y += 11;
  push(document.idCardLine, MARGIN_X, 8.5, false, PAYSLIP_COLORS.muted);
  y += 8.5;

  return { fills, rules, images, boxes, overflow: y > PAGE_HEIGHT - MARGIN_BOTTOM };
}

/** Los bordes de las columnas, para que el test afirme sobre ellos sin re-derivarlos. */
export const PAYSLIP_COLUMNS = {
  left: X_LEFT,
  quantityStart: X_QUANTITY_START,
  quantityEnd: X_QUANTITY_END,
  right: X_RIGHT,
  /** Los bordes de la hoja ÚTIL — las bandas llegan hasta aquí, el texto se queda dentro. */
  pageLeft: MARGIN_X,
  pageRight: MARGIN_X + contentWidth,
} as const;
