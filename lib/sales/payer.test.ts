import { describe, expect, it } from "vitest";
import { classifyPayer, payerLabel } from "./payer";

/**
 * Los nombres de empresa son los del archivo real de abril de 2026 del Hospital General Privado
 * Durán; los de persona son inventados con la FORMA del archivo (dos apellidos y dos nombres),
 * porque transcribir el nombre de un paciente a un test versionado es justo lo que este módulo
 * existe para no hacer.
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
    // «ROSA» contiene «sa»; buscarla como subcadena habría hecho empresa a una persona.
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
