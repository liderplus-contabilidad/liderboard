import { describe, expect, it } from "vitest";
import { validateBackupLogo } from "./logo";
import { cashFlowBackupFixture } from "./fixtures";
import type { EntityLogo } from "@/lib/logos";

function bytesOf(logo: EntityLogo): Uint8Array {
  return Uint8Array.from(atob(logo.dataUrl.split(",")[1]), (char) => char.charCodeAt(0));
}
function withBytes(logo: EntityLogo, bytes: Uint8Array): EntityLogo {
  return { ...logo, dataUrl: `data:${logo.mime};base64,${btoa(String.fromCharCode(...bytes))}` };
}
/** Recompute the header CRC so tests reach PNG semantic validation rather than the checksum. */
function editPngHeader(index: number, value: number): EntityLogo {
  const logo = cashFlowBackupFixture().clients[0].logo!;
  const bytes = bytesOf(logo);
  bytes[index] = value;
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  new DataView(bytes.buffer).setUint32(29, (crc ^ 0xffffffff) >>> 0);
  return withBytes(logo, bytes);
}
function pngChunk(type: string, data = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(
    Array.from(type, (char) => char.charCodeAt(0)),
    4,
  );
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, 8 + data.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  new DataView(bytes.buffer).setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}
function editJpeg(marker: number, delta: number, value: number): EntityLogo {
  const logo = cashFlowBackupFixture().clients[1].logo!;
  const bytes = bytesOf(logo);
  const index = bytes.findIndex((byte, i) => byte === 255 && bytes[i + 1] === marker);
  bytes[index + delta] = value;
  return withBytes(logo, bytes);
}
function removeJpegSegment(marker: number): EntityLogo {
  const logo = cashFlowBackupFixture().clients[1].logo!;
  const bytes = bytesOf(logo);
  const index = bytes.findIndex((byte, i) => byte === 255 && bytes[i + 1] === marker);
  const length = (bytes[index + 2] << 8) | bytes[index + 3];
  return withBytes(
    logo,
    new Uint8Array([...bytes.slice(0, index), ...bytes.slice(index + 2 + length)]),
  );
}

describe("embedded backup logo structure", () => {
  it("accepts real PNG and JPEG images produced by image encoders", () => {
    for (const client of cashFlowBackupFixture().clients)
      expect(() => validateBackupLogo(client.logo, "logo")).not.toThrow();
  });
  it.each([
    ["zero bit depth", 24, 0],
    ["invalid color type", 25, 1],
    ["illegal depth/color combination", 24, 4],
    ["unsupported compression", 26, 1],
    ["unsupported filter", 27, 1],
    ["invalid interlace", 28, 2],
    ["indexed image without palette", 25, 3],
  ])("rejects PNG %s even with a correct CRC", (_name, index, value) => {
    expect(() => validateBackupLogo(editPngHeader(index, value), "logo")).toThrow();
  });
  it.each([
    ["zero frame components", 192, 9, 0],
    ["invalid sampling factor", 192, 11, 0],
    ["absent quantization table", 192, 12, 3],
    ["zero scan components", 218, 4, 0],
    ["unknown scan component", 218, 5, 2],
    ["absent DC Huffman table", 218, 6, 0x30],
    ["absent AC Huffman table", 218, 6, 3],
    ["invalid baseline spectral range", 218, 8, 62],
  ])("rejects JPEG %s", (_name, marker, delta, value) => {
    expect(() => validateBackupLogo(editJpeg(marker, delta, value), "logo")).toThrow();
  });
  it("rejects JPEG with its quantization table removed", () => {
    expect(() => validateBackupLogo(removeJpegSegment(219), "logo")).toThrow();
  });
  it("rejects JPEG with its DC Huffman table removed", () => {
    expect(() => validateBackupLogo(removeJpegSegment(196), "logo")).toThrow();
  });
  it("rejects the short fake frame and componentless scan probe", () => {
    const bytes = new Uint8Array([
      255, 216, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0, 255, 218, 0, 6, 0, 0, 63, 0, 0, 255,
      217,
    ]);
    expect(() =>
      validateBackupLogo(withBytes(cashFlowBackupFixture().clients[1].logo!, bytes), "logo"),
    ).toThrow();
  });
  it("rejects nonconsecutive PNG IDAT chunks even if the first one is empty", () => {
    const logo = cashFlowBackupFixture().clients[0].logo!;
    const original = bytesOf(logo);
    const bytes = new Uint8Array([
      ...original.slice(0, 33),
      ...pngChunk("IDAT"),
      ...pngChunk("tEXt", new Uint8Array([97, 0, 98])),
      ...original.slice(33),
    ]);
    expect(() => validateBackupLogo(withBytes(logo, bytes), "logo")).toThrow();
  });
});
