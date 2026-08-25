import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip";

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

/** 1 de marzo de 2026, 14:05:20 — la hora que se le pasa al escritor en todos los casos. */
const MODIFIED = new Date(2026, 2, 1, 14, 5, 20);

/**
 * Un lector mínimo del DIRECTORIO CENTRAL, que es por donde un extractor entra de verdad: recorre
 * las fichas del final, y de cada una saca el nombre y va a buscar su contenido al desplazamiento
 * que declara. Es justo el camino que un `zipStore` con la aritmética mal rota, y el que un test
 * que solo mirara las cabeceras locales no probaría.
 */
function readCentralDirectory(
  archive: Uint8Array,
): { name: string; content: string; crc: number }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: { name: string; content: string; crc: number }[] = [];

  for (let index = 0; index < count; index++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));

    // La cabecera local del archivo al que esa ficha apunta, y su contenido justo detrás.
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataAt = offset + 30 + localNameLength + extraLength;
    files.push({
      name,
      crc,
      content: decoder.decode(archive.subarray(dataAt, dataAt + size)),
    });

    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }

  return files;
}

describe("crc32", () => {
  // El vector de siempre del CRC-32: es lo único de este archivo que se puede cotejar contra algo
  // de fuera, y es también lo que un extractor comprueba antes de entregar un archivo.
  it("da el valor conocido de «123456789»", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("da 0 con un archivo vacío", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zipStore", () => {
  it("cada entrada vuelve con su nombre y su contenido", () => {
    const archive = zipStore(
      [
        { name: "Rol-2026-03-UNO.pdf", data: bytes("primero") },
        { name: "Rol-2026-03-DOS.pdf", data: bytes("segundo, y más largo") },
        { name: "Rol-2026-03-TRES.pdf", data: bytes("tercero") },
      ],
      MODIFIED,
    );

    expect(readCentralDirectory(archive)).toEqual([
      { name: "Rol-2026-03-UNO.pdf", content: "primero", crc: crc32(bytes("primero")) },
      {
        name: "Rol-2026-03-DOS.pdf",
        content: "segundo, y más largo",
        crc: crc32(bytes("segundo, y más largo")),
      },
      { name: "Rol-2026-03-TRES.pdf", content: "tercero", crc: crc32(bytes("tercero")) },
    ]);
  });

  it("un nombre con acentos viaja en UTF-8 y vuelve entero", () => {
    const archive = zipStore([{ name: "Añó ñandú.pdf", data: bytes("x") }], MODIFIED);
    const [file] = readCentralDirectory(archive);

    expect(file?.name).toBe("Añó ñandú.pdf");
    // Bit 11 encendido en la cabecera local: es lo que le dice al extractor que el nombre no está
    // en la tabla de códigos del sistema.
    const view = new DataView(archive.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it("un archivo vacío entre dos llenos no descoloca a los de al lado", () => {
    const archive = zipStore(
      [
        { name: "a.txt", data: bytes("aaa") },
        { name: "vacio.txt", data: new Uint8Array() },
        { name: "b.txt", data: bytes("bbbb") },
      ],
      MODIFIED,
    );

    expect(readCentralDirectory(archive).map((file) => [file.name, file.content])).toEqual([
      ["a.txt", "aaa"],
      ["vacio.txt", ""],
      ["b.txt", "bbbb"],
    ]);
  });

  it("sin entradas sigue siendo un .zip válido, con cero archivos", () => {
    const archive = zipStore([], MODIFIED);

    expect(archive).toHaveLength(22);
    expect(readCentralDirectory(archive)).toEqual([]);
  });

  it("la fecha llega por parámetro, así que dos llamadas iguales dan los mismos bytes", () => {
    const entries = [{ name: "a.pdf", data: bytes("igual") }];

    expect(zipStore(entries, MODIFIED)).toEqual(zipStore(entries, MODIFIED));
  });

  it("guarda la fecha en el formato de DOS que el .zip declara", () => {
    const archive = zipStore([{ name: "a.pdf", data: bytes("x") }], MODIFIED);
    const view = new DataView(archive.buffer);

    // 14:05:20 → los segundos van en pasos de dos; 1 de marzo de 2026 → año contado desde 1980.
    expect(view.getUint16(10, true)).toBe((14 << 11) | (5 << 5) | 10);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (3 << 5) | 1);
  });

  it("una fecha anterior a 1980 se ancla en 1980 en vez de dar la vuelta al contador", () => {
    const archive = zipStore([{ name: "a.pdf", data: bytes("x") }], new Date(1970, 0, 1, 0, 0, 0));
    const view = new DataView(archive.buffer);

    expect(view.getUint16(12, true) >> 9).toBe(0);
  });
});
