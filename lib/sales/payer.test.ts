import { describe, expect, it } from "vitest";
import { classifyPayer, payerLabel } from "./payer";

/**
 * The company names are those of the real April 2026 file of the Hospital General Privado Durán; the
 * personal ones are invented with the SHAPE of the file (two surnames and two given names), because
 * transcribing a patient's name into a versioned test is exactly what this module exists not to do.
 */
describe("classifyPayer", () => {
  it("una aseguradora del archivo real es empresa", () => {
    expect(classifyPayer("SALUDSA")).toBe("empresa");
    expect(classifyPayer("BMI IGUALAS MEDICAS")).toBe("empresa");
    expect(classifyPayer("MEDIECUADOR HUMANA")).toBe("empresa");
    expect(classifyPayer("PLAN VITAL")).toBe("empresa");
    expect(classifyPayer("CONFIAMED")).toBe("empresa");
  });

  it("una marca societaria basta, venga como venga escrita", () => {
    expect(classifyPayer("ECUASANITAS S.A.")).toBe("empresa");
    expect(classifyPayer("PRODUCTOS DEL VALLE CIA LTDA")).toBe("empresa");
    expect(classifyPayer("TRANSPORTES ANDINOS SA")).toBe("empresa");
  });

  it("una palabra suelta es empresa: una persona llega con apellido y nombre", () => {
    expect(classifyPayer("CONFIAMED")).toBe("empresa");
    expect(classifyPayer("ASISTENSI")).toBe("empresa");
  });

  it("un nombre de persona es particular", () => {
    expect(classifyPayer("SANDOVAL MORALES JUAN CARLOS")).toBe("particular");
    expect(classifyPayer("PEREZ LOPEZ ANA")).toBe("particular");
    expect(classifyPayer("VILLACIS ANDRADE MARIA JOSE")).toBe("particular");
  });

  it("los acentos y las mayúsculas no cambian la lectura", () => {
    expect(classifyPayer("compañía de seguros del pichincha")).toBe("empresa");
    expect(classifyPayer("Núñez Ávila Pedro Luis")).toBe("particular");
  });

  it("una marca societaria no se confunde con una sílaba dentro de una palabra", () => {
    // «ROSA» contains «sa»; searching for it as a substring would have made a person into a company.
    expect(classifyPayer("MENDOZA ROSA ELENA")).toBe("particular");
  });

  it("un pagador sin nombre se trata como particular", () => {
    expect(classifyPayer("")).toBe("particular");
    expect(classifyPayer("   ")).toBe("particular");
  });
});

describe("payerLabel", () => {
  it("una empresa va con el nombre que trae el archivo", () => {
    expect(payerLabel("SALUDSA", "empresa", 1)).toBe("SALUDSA");
  });

  it("una persona va con su ordinal y NUNCA con su nombre", () => {
    const label = payerLabel("SANDOVAL MORALES JUAN CARLOS", "particular", 3);
    expect(label).toBe("Particular · 3");
    expect(label).not.toContain("SANDOVAL");
  });
});
