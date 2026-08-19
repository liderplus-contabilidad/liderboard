/**
 * EL MEMBRETE DE UN LIBRO — un logo arriba a la IZQUIERDA de cada hoja, encima del nombre de la
 * empresa, como en un papel con hoja timbrada, y otro a la DERECHA.
 *
 * **Quién ocupa cada lado lo decide el llamador, no este archivo.** Los tres módulos reparten
 * igual —el del workspace abre por la izquierda, el del centro de esa hoja cierra por la derecha—,
 * pero de dónde sale cada uno no: en PyG y en Ocupaciones el centro es una fila que sale de los
 * datos, y en Rol de Pagos lo declara el cliente (`letterheadLogos`, en `lib/cost-center.ts`). Los
 * parámetros se llaman por su SITIO porque es lo único que este archivo sabe de ellos.
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
 *
 * **La banda llega hasta donde llega el BLOQUE DE RÓTULOS, no hasta el final de la hoja.** Anclar el
 * logo del centro a la última columna lo dejaría fuera de la primera pantalla en cuanto la hoja
 * tuviera trece meses, y en Ocupaciones —treinta y pico columnas, un día cada una— no se vería
 * nunca; anclarlo a un ancho fijo en píxeles lo deja flotando en medio de las cifras, con un hueco
 * vacío entre el nombre y él. Lo que sí es un borde de verdad es donde acaban las columnas de
 * rótulos —el código y el nombre de la cuenta en PyG, la única columna de etiquetas en
 * Ocupaciones—: es el margen derecho del preámbulo que ya está escrito debajo, así que el membrete
 * queda alineado con lo que encabeza. Y como sale de los ANCHOS REALES de esas columnas, cambiar el
 * ancho del nombre mueve el logo con él.
 */
import type ExcelJS from "exceljs";
import { fitLogoBox, logoBase64, logoExtension, type EntityLogo } from "@/lib/logos";

/**
 * El hueco de CADA logo, en píxeles. Ancho generoso —cubre la columna del código y la del nombre,
 * que juntas pasan de 300 px— y alto de unas tres filas: lo que un membrete pide sin empujar el
 * estado de resultados fuera de la primera pantalla.
 */
const LOGO_SLOT = { width: 240, height: 56 };

/** Aire mínimo entre los dos logos cuando el bloque de rótulos es más estrecho que ellos dos. */
const LOGO_GAP = 16;

/** Alto por defecto de una fila de Excel, en píxeles. Es lo que convierte el alto del logo en filas. */
const ROW_HEIGHT = 20;

/**
 * El ancho de una columna que nadie declaró, en CARACTERES. Son los 64 px de una columna recién
 * creada, que es lo que mide una hoja en blanco de Excel.
 */
const DEFAULT_COLUMN_WIDTH = 8.43;

/**
 * Un ancho de columna en píxeles. Una hoja mide en caracteres de su fuente por defecto, y la
 * conversión de Excel es 7 px por carácter más 5 de relleno.
 */
export function columnWidthPx(width: number | undefined): number {
  return Math.round((width ?? DEFAULT_COLUMN_WIDTH) * 7) + 5;
}

/**
 * Tope de columnas que se recorren buscando un desplazamiento. `XFD` es la última de Excel, pero
 * mucho antes de eso un ancla se ha vuelto absurda: esto solo está para que un `px` disparatado no
 * gire para siempre.
 */
const MAX_ANCHOR_COLUMN = 256;

/** EMU por píxel — la unidad en la que el formato xlsx guarda el desplazamiento de una imagen. */
const EMU_PER_PIXEL = 9525;

/**
 * El ancla de una imagen: la columna ENTERA y cuántos EMU dentro de ella empieza.
 *
 * **No se usa la forma fraccionaria de exceljs (`col: 3.5`) a propósito, y no es preferencia.** Su
 * `Anchor` convierte esa fracción con `ancho_en_caracteres × 10000` EMU por columna, cuando un
 * carácter mide unos 66.700 EMU: toda fracción sale encogida más de seis veces, así que un logo
 * pedido al 80% de una columna ancha se dibuja al 13% de ella. Se vio en el archivo — el logo del
 * centro aparecía nada más empezar la columna del nombre en vez de al final. `nativeCol` +
 * `nativeColOff` es la representación del propio formato y exceljs la escribe tal cual.
 */
export interface ColumnAnchor {
  nativeCol: number;
  /** Desplazamiento dentro de esa columna, en EMU. */
  nativeColOff: number;
}

/**
 * Dónde cae un desplazamiento en píxeles, en el vocabulario del formato. `widths` son los anchos
 * declarados, en el orden de la hoja; las columnas que no llegan a la lista valen lo que vale una
 * columna en blanco, que es exactamente lo que pasa en la hoja de verdad.
 *
 * Es puro y por eso se puede probar: es la única aritmética de este archivo que puede estar mal, y
 * un logo mal anclado se descubre abriendo el .xlsx, no leyendo el código.
 */
export function columnAnchorAt(widths: readonly (number | undefined)[], px: number): ColumnAnchor {
  let remaining = Math.max(0, px);
  for (let index = 0; index < MAX_ANCHOR_COLUMN; index++) {
    const width = columnWidthPx(widths[index]);
    if (remaining < width) {
      return { nativeCol: index, nativeColOff: Math.round(remaining * EMU_PER_PIXEL) };
    }
    remaining -= width;
  }
  return { nativeCol: MAX_ANCHOR_COLUMN, nativeColOff: 0 };
}

/**
 * Dónde acaba la banda del membrete, en píxeles: el borde derecho del bloque de rótulos, salvo que
 * los dos logos no quepan en él, en cuyo caso la banda se ensancha lo justo para que no se pisen.
 *
 * Esa segunda mitad no es defensiva de más: la columna de etiquetas de Ocupaciones mide unos 285 px
 * y un logo apaisado puede pedir 240, así que sin ella dos logos anchos se solaparían — y un logo
 * encima de otro no es un membrete, es un borrón.
 *
 * Puro, porque es la aritmética que decide dónde acaba el logo y esa es exactamente la que no se
 * puede comprobar leyendo el código: se comprueba abriendo el .xlsx.
 */
export function bandWidthFor(
  widths: readonly (number | undefined)[],
  /** Cuántas columnas de la izquierda son rótulos: 2 en PyG (código + nombre), 1 en Ocupaciones. */
  labelColumns: number,
  leftWidth: number,
  rightWidth: number,
): number {
  let labels = 0;
  for (let index = 0; index < labelColumns; index++) {
    labels += columnWidthPx(widths[index]);
  }
  return Math.max(labels, leftWidth + LOGO_GAP + rightWidth);
}

/**
 * Los ids de imagen que ya tiene cada libro, por data URL. `wb.addImage` no deduplica, así que sin
 * esto un «Excel completo» de doce centros embebería doce copias del mismo PNG del cliente. La clave
 * es el data URL y no el objeto, porque el mismo logo puede llegar en dos objetos distintos —uno del
 * cliente y otro leído de su registro de centros— y seguir siendo un solo PNG.
 */
const imageIds = new WeakMap<ExcelJS.Workbook, Map<string, number>>();

function imageIdFor(wb: ExcelJS.Workbook, logo: EntityLogo): number {
  let byUrl = imageIds.get(wb);
  if (!byUrl) {
    byUrl = new Map();
    imageIds.set(wb, byUrl);
  }
  const cached = byUrl.get(logo.dataUrl);
  if (cached !== undefined) {
    return cached;
  }
  const id = wb.addImage({ base64: logoBase64(logo), extension: logoExtension(logo) });
  byUrl.set(logo.dataUrl, id);
  return id;
}

/**
 * Abre el hueco del membrete al principio de una hoja RECIÉN CREADA y ancla en él los logos: el del
 * cliente pegado al borde izquierdo, el del centro alineado contra el borde derecho de la banda.
 * Se llama antes del preámbulo; sin ningún logo no hace nada, que es lo que permite llamarlo
 * incondicionalmente.
 *
 * Los ANCHOS DE COLUMNA de la hoja tienen que estar ya puestos cuando se llama, porque es de ellos
 * de donde sale el ancla del logo derecho. Ponerlos no escribe ninguna fila, así que adelantarlos
 * no cambia nada más.
 */
export function writeLogoHeader(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  /** El que encabeza a la izquierda, pegado al borde. */
  leftLogo: EntityLogo | null | undefined,
  /** El de la derecha. El Consolidado, el mes en crudo y un cliente sin centro no tienen. */
  rightLogo?: EntityLogo | null | undefined,
  /**
   * Cuántas columnas de la izquierda son rótulos y no cifras. Es lo que fija el borde derecho de la
   * banda, así que solo importa cuando hay un segundo logo.
   */
  labelColumns = 2,
): void {
  if (!leftLogo && !rightLogo) {
    return;
  }
  const left = leftLogo ? fitLogoBox(leftLogo, LOGO_SLOT) : null;
  const right = rightLogo ? fitLogoBox(rightLogo, LOGO_SLOT) : null;

  // El hueco lo pide el más alto de los dos: con filas para uno solo, el otro se derramaría sobre
  // el preámbulo.
  const height = Math.max(left?.height ?? 0, right?.height ?? 0);
  const rows = Math.max(1, Math.ceil(height / ROW_HEIGHT));
  for (let i = 0; i < rows; i++) {
    ws.addRow([]);
  }

  if (leftLogo && left) {
    ws.addImage(imageIdFor(wb, leftLogo), {
      tl: topLeftAt({ nativeCol: 0, nativeColOff: 0 }),
      ext: left,
      editAs: "oneCell",
    });
  }
  if (rightLogo && right) {
    const widths = (ws.columns ?? []).map((column) => column?.width);
    const band = bandWidthFor(widths, labelColumns, left?.width ?? 0, right.width);
    ws.addImage(imageIdFor(wb, rightLogo), {
      tl: topLeftAt(columnAnchorAt(widths, Math.max(0, band - right.width))),
      ext: right,
      editAs: "oneCell",
    });
  }
}

/**
 * El ancla en la fila 0, en la forma que `addImage` acepta.
 *
 * El cast es a los TIPOS de exceljs, no a su comportamiento: su `Anchor` lee `nativeCol`/
 * `nativeColOff` desde siempre —y son los que escribe tal cual en `<xdr:col>`/`<xdr:colOff>`—, pero
 * sus `.d.ts` solo declaran la pareja `{col, row}`, que es justo la que convierte mal. Se aísla en
 * una función para que el cast esté escrito UNA vez y con su motivo al lado.
 */
function topLeftAt(anchor: ColumnAnchor): { col: number; row: number } {
  return { ...anchor, nativeRow: 0, nativeRowOff: 0 } as unknown as { col: number; row: number };
}
