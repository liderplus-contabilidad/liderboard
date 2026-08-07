/**
 * EL MEMBRETE DE UN LIBRO — el logo del cliente arriba a la IZQUIERDA de cada hoja, encima del
 * nombre de la empresa, como en un papel con hoja timbrada.
 *
 * Vive aparte y no dentro de cada `export.ts` porque los dos módulos que descargan Excel —PyG y
 * Ocupaciones— quieren exactamente lo mismo, y dos versiones de «dónde va el logo» acabarían
 * poniéndolo en sitios distintos.
 *
 * **El hueco se reserva ESCRIBIENDO, no desplazando.** Se intentó estampar el logo sobre el libro
 * ya terminado, abriendo sitio con `spliceRows`; se descartó porque exceljs pierde las NOTAS de
 * celda al mover filas (medido: `spliceRows` e `insertRows` las borran las dos), y en esas notas
 * viajan los comentarios del contador y el «Valor original» de cada ajuste — o sea, justo lo que
 * hace que el libro descargado explique sus propias cifras. Por eso `writeLogoHeader` se llama al
 * principio de cada hoja, cuando todavía está vacía y no hay ninguna nota que perder.
 *
 * **Desplazar el preámbulo es seguro, y no por casualidad.** Ningún lector de esta app lo busca en
 * una fila fija: `findFirstDataRow` localiza la primera fila con código de cuenta, `findHeaderRow`
 * retrocede desde ella y `readCompanyName` toma la primera celda no vacía de la COLUMNA A por
 * encima de esa cabecera. Unas filas en blanco delante no cambian ninguna de las tres respuestas.
 * La imagen tampoco estorba: el libro se relee con SheetJS, que ignora las imágenes flotantes.
 */
import type ExcelJS from "exceljs";
import { fitLogoBox, logoBase64, logoExtension, type EntityLogo } from "@/lib/logos";

/**
 * El hueco del membrete en píxeles. Ancho generoso —cubre la columna del código y la del nombre,
 * que juntas pasan de 300 px— y alto de unas tres filas: lo que un membrete pide sin empujar el
 * estado de resultados fuera de la primera pantalla.
 */
const LOGO_SLOT = { width: 260, height: 56 };

/** Alto por defecto de una fila de Excel, en píxeles. Es lo que convierte el alto del logo en filas. */
const ROW_HEIGHT = 20;

/**
 * El id de imagen que ya tiene cada libro. `wb.addImage` no deduplica, así que sin esto un «Excel
 * completo» de doce centros embebería doce copias del mismo PNG.
 */
const imageIds = new WeakMap<ExcelJS.Workbook, number>();

function imageIdFor(wb: ExcelJS.Workbook, logo: EntityLogo): number {
  const cached = imageIds.get(wb);
  if (cached !== undefined) {
    return cached;
  }
  const id = wb.addImage({ base64: logoBase64(logo), extension: logoExtension(logo) });
  imageIds.set(wb, id);
  return id;
}

/**
 * Abre el hueco del membrete al principio de una hoja RECIÉN CREADA y ancla el logo en él. Se llama
 * antes del preámbulo; sin logo no hace nada, que es lo que permite llamarlo incondicionalmente.
 */
export function writeLogoHeader(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  logo: EntityLogo | null | undefined,
): void {
  if (!logo) {
    return;
  }
  const ext = fitLogoBox(logo, LOGO_SLOT);
  const rows = Math.max(1, Math.ceil(ext.height / ROW_HEIGHT));
  for (let i = 0; i < rows; i++) {
    ws.addRow([]);
  }
  ws.addImage(imageIdFor(wb, logo), { tl: { col: 0, row: 0 }, ext, editAs: "oneCell" });
}
