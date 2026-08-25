/**
 * UN .ZIP, ESCRITO A MANO Y SIN COMPRIMIR — puro, y por eso testeable.
 *
 * Existe porque una descarga de esta app puede ser VARIOS archivos: los comprobantes de una nómina
 * son un PDF por empleado, y el navegador solo baja un archivo por gesto. Es la misma vecindad de
 * `lib/download.ts` —el único sitio donde esta app baja un archivo— y por el mismo motivo: dos
 * versiones de «cómo se empaqueta» acabarían escribiendo dos formatos distintos.
 *
 * **No se añadió una dependencia, y no es ahorro de bytes**: lo que aquí se necesita es la mitad
 * trivial del formato —`store`, sin compresión—, y el contenido que va dentro (PDF, xlsx) ya viene
 * comprimido, así que desinflarlo otra vez no quita ni un kilobyte. Un `zip` de `store` son tres
 * estructuras y un CRC-32; lo único que puede estar mal es la aritmética de desplazamientos, y por
 * eso vive suelto y con tests.
 *
 * **Sin ZIP64**: los tamaños viajan en 32 bits, así que el archivo entero tiene que quedarse por
 * debajo de 4 GB. Una nómina de treinta comprobantes pesa cientos de kilobytes, y el día que un
 * consumidor se acerque a ese techo lo que hace falta es ZIP64, no un parche aquí.
 */

export interface ZipEntry {
  /** El nombre del archivo DENTRO del .zip. Viaja en UTF-8. */
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

/** Los tres bloques de cabecera, en bytes, sin contar el nombre. */
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;

/** Guardado tal cual, sin comprimir. */
const METHOD_STORE = 0;
/** Bit 11: el nombre del archivo va en UTF-8 y no en la tabla de códigos del sistema. */
const FLAG_UTF8 = 0x0800;
/** La versión del formato que pide un `store`: la 2.0. */
const VERSION = 20;

/** La tabla del CRC-32 de PKZIP (polinomio `0xedb88320`), construida una vez. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/** El CRC-32 que cada entrada declara. Es la única forma que tiene un extractor de saber que lo
 *  que sacó es lo que se metió. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ (bytes[index] as number)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * La fecha en el formato de MS-DOS que el .zip guarda: dos enteros de 16 bits, con los segundos en
 * pasos de dos y el año contado desde 1980. El formato no sabe de fechas anteriores, así que
 * cualquiera por debajo se ancla en ese año en vez de dar la vuelta al contador.
 */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/**
 * Las entradas, empaquetadas en un .zip.
 *
 * La fecha llega POR PARÁMETRO y no se lee del reloj aquí: es lo único que impediría afirmar en un
 * test que dos llamadas con los mismos archivos dan los mismos bytes.
 *
 * Los nombres se escriben tal como llegan —esta capa no los valida ni los desduplica—, porque quién
 * puede llamarse cómo es del consumidor: en los comprobantes lo decide `payslipZipEntryNames`, que
 * desempata dos empleados del mismo nombre con su posición en la nómina.
 */
export function zipStore(entries: readonly ZipEntry[], modified: Date): Uint8Array {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }));

  const localBytes = files.reduce(
    (total, file) => total + LOCAL_SIZE + file.name.length + file.data.length,
    0,
  );
  const centralBytes = files.reduce((total, file) => total + CENTRAL_SIZE + file.name.length, 0);

  const out = new Uint8Array(localBytes + centralBytes + END_SIZE);
  const view = new DataView(out.buffer);
  const { time, date } = dosDateTime(modified);

  // ── Una cabecera local y su contenido, por archivo ───────────────────────────────────────────
  const offsets: number[] = [];
  let at = 0;
  for (const file of files) {
    offsets.push(at);
    view.setUint32(at, LOCAL_HEADER, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, FLAG_UTF8, true);
    view.setUint16(at + 8, METHOD_STORE, true);
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, file.crc, true);
    // Sin comprimir, el tamaño «comprimido» y el real son el mismo número.
    view.setUint32(at + 18, file.data.length, true);
    view.setUint32(at + 22, file.data.length, true);
    view.setUint16(at + 26, file.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(file.name, at + LOCAL_SIZE);
    out.set(file.data, at + LOCAL_SIZE + file.name.length);
    at += LOCAL_SIZE + file.name.length + file.data.length;
  }

  // ── El directorio central: la misma ficha de cada archivo, más DÓNDE empieza ─────────────────
  // Es lo que un extractor lee primero, y por eso el desplazamiento de cada cabecera local se
  // apunta arriba mientras se escribe en vez de recalcularse: recalcularlo sería una segunda
  // aritmética capaz de separarse de la primera, y un .zip con un solo offset mal apunta a la mitad
  // de otro archivo sin que su CRC llegue a comprobarse.
  const centralAt = at;
  for (const [index, file] of files.entries()) {
    view.setUint32(at, CENTRAL_HEADER, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, VERSION, true);
    view.setUint16(at + 8, FLAG_UTF8, true);
    view.setUint16(at + 10, METHOD_STORE, true);
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, date, true);
    view.setUint32(at + 16, file.crc, true);
    view.setUint32(at + 20, file.data.length, true);
    view.setUint32(at + 24, file.data.length, true);
    view.setUint16(at + 28, file.name.length, true);
    // Sin campo extra, sin comentario, un solo disco y sin atributos: nada de eso significa algo
    // para un archivo que solo transporta descargas.
    view.setUint16(at + 30, 0, true);
    view.setUint16(at + 32, 0, true);
    view.setUint16(at + 34, 0, true);
    view.setUint16(at + 36, 0, true);
    view.setUint32(at + 38, 0, true);
    view.setUint32(at + 42, offsets[index] as number, true);
    out.set(file.name, at + CENTRAL_SIZE);
    at += CENTRAL_SIZE + file.name.length;
  }

  // ── El cierre: cuántos archivos hay y dónde empieza el directorio ────────────────────────────
  view.setUint32(at, END_OF_CENTRAL, true);
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, files.length, true);
  view.setUint16(at + 10, files.length, true);
  view.setUint32(at + 12, centralBytes, true);
  view.setUint32(at + 16, centralAt, true);
  view.setUint16(at + 20, 0, true);

  return out;
}
