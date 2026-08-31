import { describe, expect, it } from "vitest";
import { canReadPersonnelCost } from "./availability";

describe("El candado es por SISTEMA, y no se afloja para el consolidado", () => {
  it("MicroPlus sí: es el plan contra el que se escribió el mapa", () => {
    expect(canReadPersonnelCost({ sourceSystemId: "microplus", isConsolidated: false })).toBe(true);
  });

  it("otro sistema no: allí `5.2.04.01.03` no es la misma cuenta con otro nombre, es otra cuenta", () => {
    expect(canReadPersonnelCost({ sourceSystemId: "dingoo", isConsolidated: false })).toBe(false);
    expect(canReadPersonnelCost({ sourceSystemId: "monthly-centers", isConsolidated: false })).toBe(
      false,
    );
  });

  it("un workspace sin sistema declarado tampoco", () => {
    expect(canReadPersonnelCost({ sourceSystemId: null, isConsolidated: false })).toBe(false);
  });

  it("el consolidado nunca, ni siquiera si el sistema calzara", () => {
    expect(canReadPersonnelCost({ sourceSystemId: "microplus", isConsolidated: true })).toBe(false);
  });
});
