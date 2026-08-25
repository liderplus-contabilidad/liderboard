/**
 * EL MEMBRETE DE UN LIBRO — una banda del ANCHO DE LA TABLA al principio de cada hoja: el logo del
 * cliente pegado al borde izquierdo, el bloque de título CENTRADO sobre las columnas, y el logo del
 * centro pegado al borde derecho.
 *
 * **Quién ocupa cada lado lo decide el llamador, no este archivo.** Los tres módulos reparten
 * igual —el del workspace abre por la izquierda, el del centro de esa hoja cierra por la derecha—,
 * pero de dónde sale cada uno no: en PyG y en Ocupaciones el centro es una fila que sale de los
 * datos, y en Rol de Pagos lo declara el cliente (`letterheadLogos`, en `lib/cost-center.ts`). Los
 * parámetros se llaman por su SITIO porque es lo único que este archivo sabe de ellos.
 *
 * Vive aparte y no dentro de cada `export.ts` porque los tres módulos que descargan Excel quieren
 * exactamente lo mismo, y dos versiones de «dónde va el membrete» acabarían poniéndolo en sitios
 * distintos.
 *
 * **El hueco se reserva ESCRIBIENDO, no desplazando.** Se intentó estampar el logo sobre el libro
 * ya terminado, abriendo sitio con `spliceRows`; se descartó porque exceljs pierde las NOTAS de
 * celda al mover filas (medido: `spliceRows` e `insertRows` las borran las dos), y en esas notas
 * viajan los comentarios del contador y el «Valor original» de cada ajuste — o sea, justo lo que
 * hace que el libro descargado explique sus propias cifras. Por eso `writeLetterhead` se llama al
 * principio de cada hoja, cuando todavía está vacía y no hay ninguna nota que perder.
 *
 * **La banda llega hasta el final de la TABLA.** Acabó antes en el bloque de rótulos —el código y
 * el nombre de la cuenta—, y era defendible: así el logo derecho se veía sin desplazarse. Pero un
 * membrete es la cabeza de la tabla, y uno que para a 390 px no se lee como su esquina sino como
 * algo flotando entre las cifras. El precio está aceptado y es real: en Ocupaciones (unas 35
 * columnas de días) y en Rol de Pagos (ochenta) tanto el logo derecho como el centro del título
 * caen fuera de la primera pantalla y hay que desplazarse hasta ellos. En PyG con trece meses la
 * banda mide ~1.640 px, que sí entra en un monitor normal. Y como sale de los ANCHOS REALES de las
 * columnas, cambiar el ancho de una mueve el membrete con ella.
 *
 * **El bloque de título se combina desde la columna del PROPIO MÓDULO, no siempre desde la A**, y
 * eso es lo único que sostiene el viaje de vuelta: el valor de una celda combinada vive en su
 * esquina superior izquierda, y cada lector busca el suyo en una columna concreta —`findCompany`
 * lee la B en Rol de Pagos, `readNames` y `readCompanyName` leen la A—. Combinando desde la columna
 * que ese lector ya mira, los tres archivos re-entran sin tocar ni un parser.
 *
 * **Desplazar el preámbulo es seguro, y no por casualidad.** Ningún lector de esta app lo busca en
 * una fila fija: `findFirstDataRow` localiza la primera fila con código de cuenta, `findHeaderRow`
 * retrocede desde ella, `readNames` cuenta líneas no vacías y `findCompany`/`findPeriod` localizan
 * lo suyo por su forma. Unas filas de membrete delante no cambian ninguna de esas respuestas. La
 * imagen tampoco estorba: el libro se relee con SheetJS, que ignora las imágenes flotantes.
 */
import type ExcelJS from "exceljs";
import { fitLogoBox, logoBase64, logoExtension, type EntityLogo } from "@/lib/logos";

/**
 * El hueco de CADA logo, en píxeles. Ancho generoso —cubre la columna del código y la del nombre,
 * que juntas pasan de 300 px— y alto de unas tres filas: lo que un membrete pide sin empujar el
 * estado de resultados fuera de la primera pantalla.
 */
const LOGO_SLOT = { width: 240, height: 56 };

/** Aire mínimo entre los dos logos cuando la tabla es más estrecha que ellos dos. */
const LOGO_GAP = 16;

/** Alto por defecto de una fila de Excel, en píxeles. Es lo que convierte el alto del logo en filas. */
const ROW_HEIGHT = 20;

/**
 * El ancho de una columna que nadie declaró, en CARACTERES. Son los 64 px de una columna recién
 * creada, que es lo que mide una hoja en blanco de Excel.
 */
const DEFAULT_COLUMN_WIDTH = 8.43;

/** El relleno de la banda y la raya que la cierra — los grises con los que las tres descargas ya
 *  pintan sus cabeceras, para que el membrete no estrene un dialecto propio. */
const BAND_FILL = "FFF1F5F9";
const BAND_RULE = "FF94A3B8";

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
 * Dónde acaba la banda del membrete, en píxeles: el borde derecho de la TABLA, salvo que los dos
 * logos no quepan en ella, en cuyo caso la banda se ensancha lo justo para que no se pisen.
 *
 * Esa segunda mitad no es defensiva de más: un estado de modo único son tres columnas y un logo
 * apaisado puede pedir 240, así que sin ella dos logos anchos se solaparían — y un logo encima de
 * otro no es un membrete, es un borrón.
 *
 * Puro, porque es la aritmética que decide dónde acaba el logo y esa es exactamente la que no se
 * puede comprobar leyendo el código: se comprueba abriendo el .xlsx.
 */
export function bandWidthFor(
  widths: readonly (number | undefined)[],
  /** Cuántas columnas mide la TABLA que se encabeza. */
  tableColumns: number,
  leftWidth: number,
  rightWidth: number,
): number {
  let table = 0;
  for (let index = 0; index < tableColumns; index++) {
    table += columnWidthPx(widths[index]);
  }
  return Math.max(table, leftWidth + LOGO_GAP + rightWidth);
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

/** Una línea del bloque de título, con la tinta que le toque. */
export interface LetterheadLine {
  text: string;
  font?: Partial<ExcelJS.Font>;
}

export interface Letterhead {
  /** El que encabeza a la izquierda, pegado al borde. */
  leftLogo?: EntityLogo | null;
  /** El de la derecha. El Consolidado, el mes en crudo y un cliente sin centro no tienen. */
  rightLogo?: EntityLogo | null;
  /** Cuántas columnas mide la TABLA. Es lo que fija el borde derecho de la banda. */
  columns: number;
  /**
   * Desde qué columna (1-based) se combina el bloque de título. La A salvo en Rol de Pagos, cuyo
   * lector busca la empresa en la B — ver la cabecera del archivo.
   */
  firstColumn?: number;
  /** Las líneas del título, ya compuestas por el módulo. */
  lines?: readonly LetterheadLine[];
}

/**
 * Escribe la banda del membrete al principio de una hoja RECIÉN CREADA: las filas del bloque de
 * título centradas sobre la tabla, el relleno que las hace parecer una cabecera y no texto suelto
 * en A1, la raya que las separa de lo que viene debajo, y los dos logos anclados a los bordes.
 * Sin logos y sin líneas no hace nada, que es lo que permite llamarla incondicionalmente.
 *
 * Los ANCHOS DE COLUMNA de la hoja tienen que estar ya puestos cuando se llama, porque de ellos
 * sale el ancla del logo derecho. Ponerlos no escribe ninguna fila, así que adelantarlos no cambia
 * nada más.
 */
export function writeLetterhead(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  band: Letterhead,
): void {
  const { columns, firstColumn = 1, lines = [] } = band;
  const left = band.leftLogo ? fitLogoBox(band.leftLogo, LOGO_SLOT) : null;
  const right = band.rightLogo ? fitLogoBox(band.rightLogo, LOGO_SLOT) : null;
  if (!left && !right && lines.length === 0) {
    return;
  }

  // El alto lo pide el más alto de los dos lados: el bloque de título y el logo. Con filas para uno
  // solo, el otro se derramaría sobre lo que viene debajo.
  const logoHeight = Math.max(left?.height ?? 0, right?.height ?? 0);
  const rows = Math.max(lines.length, Math.ceil(logoHeight / ROW_HEIGHT), 1);
  const lastColumn = Math.max(columns, firstColumn);

  // Las filas se pintan ANTES de combinarlas: exceljs propaga a todo el rango el estilo de la
  // celda maestra, así que combinar al final es lo que reparte el relleno y la raya sin que haya
  // que volver a escribirlos celda a celda dentro del rango.
  const written: ExcelJS.Row[] = [];
  for (let index = 0; index < rows; index++) {
    const row = ws.addRow([]);
    written.push(row);
    for (let column = 1; column <= lastColumn; column++) {
      const cell = row.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      if (index === rows - 1) {
        cell.border = { bottom: { style: "thin", color: { argb: BAND_RULE } } };
      }
    }
  }

  lines.forEach((line, index) => {
    const row = written[index];
    if (!row) {
      return;
    }
    const cell = row.getCell(firstColumn);
    cell.value = line.text;
    if (line.font) {
      cell.font = line.font;
    }
    cell.alignment = { horizontal: "center", vertical: "middle" };
    if (lastColumn > firstColumn) {
      ws.mergeCells(row.number, firstColumn, row.number, lastColumn);
    }
  });

  // Centrados contra la banda ENTERA y no colgados de su primera fila: un logo alineado por arriba
  // sobre un membrete de cuatro líneas deja un hueco bajo él que se lee como un error de
  // composición. Es la misma regla que el encabezado del comprobante en PDF.
  const bandHeight = rows * ROW_HEIGHT;
  if (band.leftLogo && left) {
    ws.addImage(imageIdFor(wb, band.leftLogo), {
      tl: topLeftAt({ nativeCol: 0, nativeColOff: 0 }, (bandHeight - left.height) / 2),
      ext: left,
      editAs: "oneCell",
    });
  }
  if (band.rightLogo && right) {
    const widths = (ws.columns ?? []).map((column) => column?.width);
    const width = bandWidthFor(widths, columns, left?.width ?? 0, right.width);
    ws.addImage(imageIdFor(wb, band.rightLogo), {
      tl: topLeftAt(
        columnAnchorAt(widths, Math.max(0, width - right.width)),
        (bandHeight - right.height) / 2,
      ),
      ext: right,
      editAs: "oneCell",
    });
  }
}

/**
 * El ancla en la primera fila, `offsetPx` dentro de ella, en la forma que `addImage` acepta.
 *
 * El cast es a los TIPOS de exceljs, no a su comportamiento: su `Anchor` lee `nativeCol`/
 * `nativeColOff` desde siempre —y son los que escribe tal cual en `<xdr:col>`/`<xdr:colOff>`—, pero
 * sus `.d.ts` solo declaran la pareja `{col, row}`, que es justo la que convierte mal. Se aísla en
 * una función para que el cast esté escrito UNA vez y con su motivo al lado.
 */
function topLeftAt(anchor: ColumnAnchor, offsetPx = 0): { col: number; row: number } {
  return {
    ...anchor,
    nativeRow: 0,
    nativeRowOff: Math.round(Math.max(0, offsetPx) * EMU_PER_PIXEL),
  } as unknown as { col: number; row: number };
}
