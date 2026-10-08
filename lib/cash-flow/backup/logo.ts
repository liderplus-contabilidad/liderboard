import {
  enumValue,
  invalid,
  objectFields,
  positiveNumber,
  stringValue,
  type Validator,
} from "@/lib/backup/validation";

/** No network fetch or DOM image load: stored logos are strictly embedded PNG/JPEG bytes. */
export const validateBackupLogo: Validator = (value, path) => {
  const logo = objectFields(value, path, {
    dataUrl: stringValue,
    mime: enumValue("image/png", "image/jpeg"),
    width: positiveNumber,
    height: positiveNumber,
  });
  const match =
    /^data:(image\/(?:png|jpeg));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(
      logo.dataUrl as string,
    );
  if (!match || match[1] !== logo.mime || !match[2]) invalid(path);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  } catch {
    invalid(path);
  }
  const dimensions = logo.mime === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!dimensions || dimensions[0] !== logo.width || dimensions[1] !== logo.height) invalid(path);
};

function pngDimensions(bytes: Uint8Array): [number, number] | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || signature.some((byte, i) => bytes[i] !== byte)) return null;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let dimensions: [number, number] | null = null;
  let colorType = -1;
  let bitDepth = 0;
  let paletteSize = 0;
  let hasData = false;
  let dataEnded = false;
  let hasTransparency = false;
  let dataLength = 0;
  const zlibHeader: number[] = [];
  while (offset + 12 <= bytes.length) {
    const length = data.getUint32(offset);
    if (length > bytes.length - offset - 12) return null;
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (
      !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind) ||
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== data.getUint32(offset + 8 + length)
    )
      return null;
    if (offset === 8) {
      if (kind !== "IHDR" || length !== 13) return null;
      dimensions = [data.getUint32(offset + 8), data.getUint32(offset + 12)];
      if (dimensions.some((side) => side === 0 || side > 0x7fffffff)) return null;
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      const depths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !depths[colorType]?.includes(bitDepth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      )
        return null;
    } else if (kind === "IHDR") return null;
    if (kind === "PLTE") {
      if (
        paletteSize ||
        hasData ||
        colorType === 0 ||
        colorType === 4 ||
        length === 0 ||
        length % 3 ||
        length > 768
      )
        return null;
      paletteSize = length / 3;
      if (colorType === 3 && paletteSize > 2 ** bitDepth) return null;
    } else if (kind === "tRNS") {
      if (hasTransparency || hasData || ![0, 2, 3].includes(colorType)) return null;
      if (
        (colorType === 0 && length !== 2) ||
        (colorType === 2 && length !== 6) ||
        (colorType === 3 && (!paletteSize || length === 0 || length > paletteSize))
      )
        return null;
      hasTransparency = true;
    } else if (kind === "IDAT") {
      if (dataEnded || (colorType === 3 && !paletteSize)) return null;
      hasData = true;
      dataLength += length;
      for (let i = 0; i < length && zlibHeader.length < 2; i++)
        zlibHeader.push(bytes[offset + 8 + i]);
    } else {
      if (hasData) dataEnded = true;
      // Unknown critical chunks require another decoder/version; ancillary metadata is retained.
      if (kind !== "IHDR" && kind !== "IEND" && kind[0] === kind[0].toUpperCase()) return null;
    }
    offset += length + 12;
    if (kind === "IEND") {
      const [cmf, flags] = zlibHeader;
      const validZlib =
        dataLength > 6 &&
        (cmf & 15) === 8 &&
        cmf >>> 4 <= 7 &&
        ((cmf << 8) | flags) % 31 === 0 &&
        !(flags & 32);
      return length === 0 && validZlib && offset === bytes.length ? dimensions : null;
    }
  }
  return null;
}

/** PNG checksums reject broken embedded images without a browser decoder. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jpegDimensions(bytes: Uint8Array): [number, number] | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes[bytes.length - 2] !== 255 ||
    bytes[bytes.length - 1] !== 217
  )
    return null;
  let offset = 2;
  let dimensions: [number, number] | null = null;
  let progressive = false;
  let restartInterval = 0;
  let scanCount = 0;
  const components = new Map<number, number>();
  const scannedComponents = new Set<number>();
  const quantization = new Set<number>();
  const huffman = new Set<string>();
  while (offset + 2 <= bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217)
      return dimensions &&
        scanCount > 0 &&
        scannedComponents.size === components.size &&
        offset === bytes.length
        ? dimensions
        : null;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if ([192, 193, 194].includes(marker)) {
      if (dimensions || length < 11 || bytes[offset + 2] !== 8) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const count = bytes[offset + 7];
      if (width <= 0 || height <= 0 || ![1, 3, 4].includes(count) || length !== 8 + 3 * count)
        return null;
      for (let index = 0; index < count; index++) {
        const start = offset + 8 + 3 * index;
        const id = bytes[start];
        const sampling = bytes[start + 1];
        const table = bytes[start + 2];
        if (
          components.has(id) ||
          !(sampling >> 4) ||
          sampling >> 4 > 4 ||
          !(sampling & 15) ||
          (sampling & 15) > 4 ||
          table > 3
        )
          return null;
        components.set(id, table);
      }
      progressive = marker === 194;
      dimensions = [width, height];
    } else if (marker === 219) {
      let cursor = offset + 2;
      while (cursor < offset + length) {
        const spec = bytes[cursor++];
        const precision = spec >> 4;
        if (precision > 1 || (spec & 15) > 3) return null;
        const count = 64 * (precision + 1);
        if (cursor + count > offset + length) return null;
        for (let index = 0; index < count; index += precision + 1) {
          if (
            precision
              ? ((bytes[cursor + index] << 8) | bytes[cursor + index + 1]) === 0
              : bytes[cursor + index] === 0
          )
            return null;
        }
        quantization.add(spec & 15);
        cursor += count;
      }
      if (cursor === offset + 2) return null;
    } else if (marker === 196) {
      let cursor = offset + 2;
      while (cursor < offset + length) {
        const spec = bytes[cursor++];
        if (spec >> 4 > 1 || (spec & 15) > 3 || cursor + 16 > offset + length) return null;
        let symbols = 0;
        let slots = 1;
        for (let index = 0; index < 16; index++) {
          const count = bytes[cursor++];
          symbols += count;
          slots = slots * 2 - count;
          if (slots < 0) return null;
        }
        if (!symbols || symbols > 256 || cursor + symbols > offset + length) return null;
        huffman.add(`${spec >> 4}:${spec & 15}`);
        cursor += symbols;
      }
      if (cursor === offset + 2) return null;
    } else if (marker === 221) {
      if (length !== 4) return null;
      restartInterval = (bytes[offset + 2] << 8) | bytes[offset + 3];
    } else if (marker === 218) {
      if (!dimensions || length < 8) return null;
      const count = bytes[offset + 2];
      if (count < 1 || count > 4 || count > components.size || length !== 6 + 2 * count)
        return null;
      const spectralStart = bytes[offset + 3 + 2 * count];
      const spectralEnd = bytes[offset + 4 + 2 * count];
      const approximation = bytes[offset + 5 + 2 * count];
      const high = approximation >> 4;
      const low = approximation & 15;
      if (
        progressive
          ? spectralStart > spectralEnd ||
            spectralEnd > 63 ||
            (spectralStart === 0 ? spectralEnd !== 0 : count !== 1) ||
            high > 13 ||
            low > 13 ||
            (high !== 0 && high !== low + 1)
          : spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0
      )
        return null;
      const picked = new Set<number>();
      for (let index = 0; index < count; index++) {
        const id = bytes[offset + 3 + 2 * index];
        const tables = bytes[offset + 4 + 2 * index];
        const quant = components.get(id);
        if (
          picked.has(id) ||
          quant === undefined ||
          !quantization.has(quant) ||
          tables >> 4 > 3 ||
          (tables & 15) > 3
        )
          return null;
        if (
          (!progressive || (spectralStart === 0 && high === 0)) &&
          !huffman.has(`0:${tables >> 4}`)
        )
          return null;
        if ((!progressive || spectralStart > 0) && !huffman.has(`1:${tables & 15}`)) return null;
        picked.add(id);
        scannedComponents.add(id);
      }
      offset += length;
      let entropyBytes = 0;
      let restart = 0;
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) {
          entropyBytes++;
          offset++;
          continue;
        }
        const start = offset;
        while (bytes[offset] === 255) offset++;
        const next = bytes[offset];
        if (next === 0) {
          entropyBytes++;
          offset++;
          continue;
        }
        if (next >= 208 && next <= 215) {
          if (!restartInterval || next !== 208 + (restart % 8) || !entropyBytes) return null;
          restart++;
          offset++;
          continue;
        }
        offset = start;
        break;
      }
      if (!entropyBytes) return null;
      scanCount++;
      continue;
    } else if (!((marker >= 224 && marker <= 239) || marker === 254)) {
      // Browser JPEG logos use Huffman DCT frames. Reject arithmetic/lossless coding explicitly.
      return null;
    }
    offset += length;
  }
  return null;
}
