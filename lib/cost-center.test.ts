import { describe, expect, it } from "vitest";
import {
  checkCostCenter,
  costCenterDraftFrom,
  costCenterHeading,
  emptyCostCenterDraft,
  letterheadLogos,
  type CostCenter,
} from "./cost-center";
import type { EntityLogo } from "./workspaces";

const LOGO: EntityLogo = {
  dataUrl: "data:image/png;base64,AAAA",
  mime: "image/png",
  width: 200,
  height: 80,
};

const OTHER_LOGO: EntityLogo = { ...LOGO, dataUrl: "data:image/png;base64,BBBB" };

const PLANTA: CostCenter = { name: "Planta Ambato", logo: LOGO };

describe("checkCostCenter", () => {
  it("un borrador vacío no es un rechazo: da un cliente sin centro", () => {
    const check = checkCostCenter(emptyCostCenterDraft());
    expect(check).toEqual({ ok: true, center: undefined });
  });

  it("guarda el nombre recortado, con su logo", () => {
    const check = checkCostCenter({ name: "  Planta   Ambato ", logo: LOGO });
    expect(check).toEqual({ ok: true, center: { name: "Planta Ambato", logo: LOGO } });
  });

  it("un centro sin logo es legítimo, y el campo no se escribe", () => {
    const check = checkCostCenter({ name: "Planta Ambato", logo: null });
    expect(check).toEqual({ ok: true, center: { name: "Planta Ambato" } });
    expect(check.ok && check.center && "logo" in check.center).toBe(false);
  });

  it("rechaza un logo sin nombre en vez de descartarlo en silencio", () => {
    const check = checkCostCenter({ name: "   ", logo: LOGO });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.message).toMatch(/nombre/i);
  });

  it("hereda el tope de 60 caracteres del nombre de un workspace", () => {
    const check = checkCostCenter({ name: "C".repeat(61), logo: null });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.message).toMatch(/60/);
  });
});

describe("costCenterDraftFrom", () => {
  it("precarga lo guardado, para que abrir el diálogo no parezca vaciarlo", () => {
    expect(costCenterDraftFrom(PLANTA)).toEqual({ name: "Planta Ambato", logo: LOGO });
  });

  it("sin centro da el borrador vacío", () => {
    expect(costCenterDraftFrom(undefined)).toEqual({ name: "", logo: null });
  });

  it("hace ida y vuelta con checkCostCenter", () => {
    expect(checkCostCenter(costCenterDraftFrom(PLANTA))).toEqual({ ok: true, center: PLANTA });
  });
});

describe("costCenterHeading", () => {
  it("compone el nombre del cliente con el del centro", () => {
    expect(costCenterHeading("Delicmar", PLANTA)).toBe("Delicmar · Planta Ambato");
  });

  it("sin centro deja el nombre del cliente exactamente como estaba", () => {
    expect(costCenterHeading("Delicmar", undefined)).toBe("Delicmar");
    expect(costCenterHeading("Delicmar", null)).toBe("Delicmar");
  });

  it("un centro con el nombre en blanco no cuelga un separador suelto", () => {
    expect(costCenterHeading("Delicmar", { name: "  " })).toBe("Delicmar");
  });
});

describe("letterheadLogos", () => {
  it("el del cliente encabeza a la izquierda y el del centro va a la derecha", () => {
    expect(letterheadLogos(OTHER_LOGO, PLANTA)).toEqual({ left: OTHER_LOGO, right: LOGO });
  });

  it("sin centro el del cliente se queda a la izquierda y no hay segundo logo", () => {
    expect(letterheadLogos(OTHER_LOGO, undefined)).toEqual({ left: OTHER_LOGO, right: undefined });
  });

  it("un centro SIN logo no abre el sitio de la derecha: lo que manda es el logo, no el nombre", () => {
    expect(letterheadLogos(OTHER_LOGO, { name: "Planta Ambato" })).toEqual({
      left: OTHER_LOGO,
      right: undefined,
    });
  });

  it("un cliente sin logo cuyo centro sí lo tiene deja la izquierda vacía, no lo asciende", () => {
    expect(letterheadLogos(null, PLANTA)).toEqual({ left: undefined, right: LOGO });
  });

  it("sin ningún logo no hay ninguno que colocar", () => {
    expect(letterheadLogos(null, { name: "Planta Ambato" })).toEqual({
      left: undefined,
      right: undefined,
    });
  });
});
