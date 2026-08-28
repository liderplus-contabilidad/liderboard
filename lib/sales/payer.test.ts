import { describe, expect, it } from "vitest";
import { payerLabel, UNIDENTIFIED_PAYER } from "./payer";

describe("payerLabel", () => {
  it("un pagador con nombre sale con el suyo, sea empresa o persona", () => {
    expect(payerLabel("SALUDVIDA")).toBe("SALUDVIDA");
    expect(payerLabel("BMI IGUALAS MEDICAS")).toBe("BMI IGUALAS MEDICAS");
    expect(payerLabel("SANDOVAL MORALES JUAN CARLOS")).toBe("SANDOVAL MORALES JUAN CARLOS");
  });

  it("lo escribe VERBATIM, sin tocar mayúsculas ni acentos", () => {
    expect(payerLabel("Núñez Ávila Pedro Luis")).toBe("Núñez Ávila Pedro Luis");
    expect(payerLabel("ECUASALUD S.A.")).toBe("ECUASALUD S.A.");
  });

  it("recorta los espacios del archivo pero no el nombre", () => {
    expect(payerLabel("  PLAN VITAL  ")).toBe("PLAN VITAL");
  });

  it("sin nombre cae en el grupo, no en una fila propia", () => {
    expect(payerLabel("")).toBe(UNIDENTIFIED_PAYER);
    expect(payerLabel("   ")).toBe(UNIDENTIFIED_PAYER);
  });
});
