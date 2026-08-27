/**
 * A .ZIP, WRITTEN BY HAND AND UNCOMPRESSED — pure, and therefore testable.
 *
 * It exists because a download of this app can be SEVERAL files: a nómina's payslips are one PDF per
 * employee, and the browser only downloads one file per gesture. It is the same neighbourhood as
 * `lib/download.ts` —the only place this app downloads a file— and for the same reason: two versions
 * of «how it is packaged» would end up writing two different formats.
 *
 * **No dependency was added, and it is not about saving bytes**: what is needed here is the trivial
 * half of the format —`store`, with no compression—, and the content that goes inside (PDF, xlsx) is
 * already compressed, so deflating it again does not save a single kilobyte. A `store` zip is three
 * structures and a CRC-32; the only thing that can be wrong is the offset arithmetic, and that is why
 * it lives on its own and with tests.
 *
 * **No ZIP64**: the sizes travel in 32 bits, so the whole file has to stay below 4 GB. A nómina of
 * thirty payslips weighs hundreds of kilobytes, and the day a consumer approaches that ceiling what
 * is needed is ZIP64, not a patch here.
 */

export interface ZipEntry {
  /** The file's name INSIDE the .zip. It travels in UTF-8. */
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

/** The three header blocks, in bytes, not counting the name. */
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;

/** Stored as it is, uncompressed. */
const METHOD_STORE = 0;
/** Bit 11: the file's name goes in UTF-8 and not in the system's code page. */
const FLAG_UTF8 = 0x0800;
/** The format version a `store` requires: 2.0. */
const VERSION = 20;

/** PKZIP's CRC-32 table (polynomial `0xedb88320`), built once. */
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

/** The CRC-32 each entry declares. It is the only way an extractor has of knowing that what it took
 *  out is what was put in. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ (bytes[index] as number)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The date in the MS-DOS format the .zip stores: two 16-bit integers, with the seconds in steps of
 * two and the year counted from 1980. The format knows nothing of earlier dates, so anything below is
 * anchored at that year instead of wrapping the counter around.
 */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/**
 * The entries, packed into a .zip.
 *
 * The date arrives BY PARAMETER and is not read off the clock here: it is the only thing that would
 * stop a test asserting that two calls with the same files give the same bytes.
 *
 * The names are written exactly as they arrive —this layer neither validates nor de-duplicates
 * them—, because who can be called what belongs to the consumer: in the payslips it is decided by
 * `payslipZipEntryNames`, which tie-breaks two employees of the same name with their position in the
 * nómina.
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

  // ── One local header and its content, per file ───────────────────────────────────────────────
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
    // Uncompressed, the «compressed» size and the real one are the same number.
    view.setUint32(at + 18, file.data.length, true);
    view.setUint32(at + 22, file.data.length, true);
    view.setUint16(at + 26, file.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(file.name, at + LOCAL_SIZE);
    out.set(file.data, at + LOCAL_SIZE + file.name.length);
    at += LOCAL_SIZE + file.name.length + file.data.length;
  }

  // ── The central directory: each file's same record, plus WHERE it starts ─────────────────────
  // It is what an extractor reads first, and that is why each local header's offset is noted above
  // while writing instead of being recomputed: recomputing it would be a second arithmetic capable of
  // drifting from the first, and a .zip with a single wrong offset points into the middle of another
  // file without its CRC ever getting checked.
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
    // No extra field, no comment, a single disk and no attributes: none of that means anything for a
    // file that only transports downloads.
    view.setUint16(at + 30, 0, true);
    view.setUint16(at + 32, 0, true);
    view.setUint16(at + 34, 0, true);
    view.setUint16(at + 36, 0, true);
    view.setUint32(at + 38, 0, true);
    view.setUint32(at + 42, offsets[index] as number, true);
    out.set(file.name, at + CENTRAL_SIZE);
    at += CENTRAL_SIZE + file.name.length;
  }

  // ── The close: how many files there are and where the directory starts ───────────────────────
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
