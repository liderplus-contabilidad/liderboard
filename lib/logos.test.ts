import { describe, expect, it } from "vitest";
import {
  centerLogoOf,
  checkLogoFile,
  decodeLogoBytes,
  fitLogoBox,
  formatBytes,
  logoBase64,
  logoExtension,
  withCenterLogo,
  LOGO_MAX_BYTES,
  type EntityLogo,
} from "./logos";

const png = (width: number, height: number): EntityLogo => ({
  // «Hi» in base64: it is not a real PNG, but `decodeLogoBytes` does not interpret it.
  dataUrl: "data:image/png;base64,SGk=",
  mime: "image/png",
  width,
  height,
});

describe("checkLogoFile", () => {
  it("admite los tres formatos que la app sabe rasterizar o embeber", () => {
    for (const type of ["image/png", "image/jpeg", "image/svg+xml"]) {
      expect(checkLogoFile({ type, size: 1024 })).toEqual({ ok: true });
    }
  });

  it("rechaza un formato que ni pdf-lib ni exceljs pueden embeber", () => {
    const check = checkLogoFile({ type: "image/webp", size: 1024 });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.message).toContain("PNG, JPG o SVG");
  });

  it("rechaza por peso NOMBRANDO el peso real, para no obligar a ir a buscarlo", () => {
    const check = checkLogoFile({ type: "image/png", size: 3.4 * 1024 * 1024 });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.message).toBe("Pesa 3,4 MB; el máximo es 2,0 MB.");
  });

  it("acepta justo en el tope y rechaza un byte por encima", () => {
    expect(checkLogoFile({ type: "image/png", size: LOGO_MAX_BYTES })).toEqual({ ok: true });
    expect(checkLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 }).ok).toBe(false);
  });

  it("mira el tipo ANTES que el peso: un WebP de 40 MB se rechaza por lo que es", () => {
    const check = checkLogoFile({ type: "image/webp", size: 40 * 1024 * 1024 });
    expect(check.ok === false && check.message).toContain("PNG, JPG o SVG");
  });
});

describe("formatBytes", () => {
  it("baja a KB por debajo del mega, donde «0,0 MB» no diría nada", () => {
    expect(formatBytes(120 * 1024)).toBe("120 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2,0 MB");
  });
});

describe("fitLogoBox", () => {
  it("un logo apaisado toca el ancho y sobra alto", () => {
    expect(fitLogoBox(png(800, 200), { width: 180, height: 56 })).toEqual({
      width: 180,
      height: 45,
    });
  });

  it("un logo vertical toca el alto y sobra ancho", () => {
    const box = fitLogoBox(png(200, 800), { width: 180, height: 56 });
    // The FREE axis is compared with tolerance: only the one that hits the limit is clamped to the
    // exact figure.
    expect(box.width).toBeCloseTo(14, 10);
    expect(box.height).toBe(56);
  });

  it("un cuadrado en un hueco cuadrado lo llena entero", () => {
    expect(fitLogoBox(png(400, 400), { width: 28, height: 28 })).toEqual({ width: 28, height: 28 });
  });

  it("NO agranda: un logo menor que su hueco se dibuja a su tamaño", () => {
    expect(fitLogoBox(png(40, 20), { width: 180, height: 56 })).toEqual({ width: 40, height: 20 });
  });

  it("nunca se sale del hueco", () => {
    const max = { width: 90, height: 34 };
    for (const [w, h] of [
      [1200, 40],
      [40, 1200],
      [1, 1],
      [91, 35],
    ]) {
      const box = fitLogoBox(png(w, h), max);
      expect(box.width).toBeLessThanOrEqual(max.width);
      expect(box.height).toBeLessThanOrEqual(max.height);
    }
  });

  it("conserva la proporción, que es lo único que la caja promete", () => {
    const box = fitLogoBox(png(640, 160), { width: 90, height: 34 });
    expect(box.width / box.height).toBeCloseTo(4, 10);
  });

  it("una dimensión imposible da una caja vacía en vez de un NaN que se propague", () => {
    expect(fitLogoBox(png(0, 100), { width: 90, height: 34 })).toEqual({ width: 0, height: 0 });
  });
});

describe("el logo hacia exceljs y pdf-lib", () => {
  it("la extensión habla el vocabulario de exceljs, no el de los MIME", () => {
    expect(logoExtension(png(10, 10))).toBe("png");
    expect(logoExtension({ ...png(10, 10), mime: "image/jpeg" })).toBe("jpeg");
  });

  it("el base64 llega pelado, sin el prefijo del data URL", () => {
    expect(logoBase64(png(10, 10))).toBe("SGk=");
  });

  it("los bytes se decodifican para pdf-lib", () => {
    expect(Array.from(decodeLogoBytes(png(10, 10)))).toEqual([72, 105]);
  });
});

describe("los logos por centro", () => {
  const restaurante = png(120, 40);

  it("devuelve el del centro pedido", () => {
    expect(centerLogoOf({ restaurante }, "restaurante")).toBe(restaurante);
  });

  it("un centro SIN logo no hereda el de otro", () => {
    expect(centerLogoOf({ restaurante }, "hospedaje")).toBeUndefined();
  });

  // It is the rule that leaves the Consolidado, the raw month and the cover with no second logo
  // without any of the three surfaces having to write its own case.
  it("sin centro no hay logo: es lo que responde por el Consolidado y la portada", () => {
    expect(centerLogoOf({ restaurante }, undefined)).toBeUndefined();
    expect(centerLogoOf({ restaurante }, null)).toBeUndefined();
  });

  it("sin registro tampoco falla", () => {
    expect(centerLogoOf(undefined, "restaurante")).toBeUndefined();
  });
});

describe("withCenterLogo", () => {
  const uno = png(120, 40);
  const otro = png(80, 80);

  it("pone el primero sobre un cliente que no tenía ninguno", () => {
    expect(withCenterLogo(undefined, "restaurante", uno)).toEqual({ restaurante: uno });
  });

  it("no toca a los demás centros", () => {
    expect(withCenterLogo({ restaurante: uno }, "hospedaje", otro)).toEqual({
      restaurante: uno,
      hospedaje: otro,
    });
  });

  it("no muta el registro que recibe", () => {
    const before = { restaurante: uno };
    withCenterLogo(before, "hospedaje", otro);
    expect(before).toEqual({ restaurante: uno });
  });

  it("quitar uno deja a los demás en pie", () => {
    expect(withCenterLogo({ restaurante: uno, hospedaje: otro }, "restaurante", null)).toEqual({
      hospedaje: otro,
    });
  });

  // A stored `{}` and an absent field say the same thing; keeping both would turn «this client has no
  // center logos» into two different questions.
  it("quitar el último descarta el registro entero en vez de guardar un objeto vacío", () => {
    expect(withCenterLogo({ restaurante: uno }, "restaurante", null)).toBeUndefined();
  });
});
