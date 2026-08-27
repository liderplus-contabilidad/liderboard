import { describe, expect, it } from "vitest";
import { verifyRosterTarget } from "./import";

const MARZO = { year: 2026, monthIndex: 2 };
const JULIO = { year: 2026, monthIndex: 6 };
const MARZO_2025 = { year: 2025, monthIndex: 2 };

describe("verifyRosterTarget", () => {
  it("acepta el archivo cuyo período declarado es el período abierto", () => {
    expect(verifyRosterTarget(MARZO, MARZO, [MARZO])).toEqual({ ok: true });
  });

  it("rechaza nombrando LOS DOS meses, no solo el del archivo", () => {
    const verdict = verifyRosterTarget(MARZO, JULIO, [MARZO, JULIO]);

    expect(verdict.ok).toBe(false);
    // The instruction of what to do comes from having both: without the open destination, the
    // accountant does not know which screen they are standing on.
    expect(verdict.ok === false && verdict.message).toContain("MARZO 2026");
    expect(verdict.ok === false && verdict.message).toContain("JULIO 2026");
  });

  it("con el período del archivo YA registrado, manda abrirlo", () => {
    const verdict = verifyRosterTarget(MARZO, JULIO, [MARZO, JULIO]);

    expect(verdict.ok === false && verdict.message).toContain("ya está registrado");
  });

  it("sin el período del archivo registrado, manda crearlo — no abrir algo que no existe", () => {
    const verdict = verifyRosterTarget(MARZO, JULIO, [JULIO]);

    expect(verdict.ok === false && verdict.message).toContain("Registra el período MARZO 2026");
    expect(verdict.ok === false && verdict.message).not.toContain("ya está registrado");
  });

  it("distingue el AÑO, no solo el mes: marzo de 2025 no cae en marzo de 2026", () => {
    const verdict = verifyRosterTarget(MARZO_2025, MARZO, [MARZO]);

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.message).toContain("MARZO 2025");
    expect(verdict.ok === false && verdict.message).toContain("MARZO 2026");
  });
});
