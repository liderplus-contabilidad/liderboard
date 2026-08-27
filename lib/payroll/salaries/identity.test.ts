import { describe, expect, it } from "vitest";
import { employeeKey } from "./identity";

function fields(name: string, idCard: string) {
  return { name, idCard };
}

describe("employeeKey", () => {
  it("agrupa por cédula aunque el nombre esté escrito de otra manera", () => {
    // The real case: one month's file shouts the name and another's writes it with accents.
    const febrero = employeeKey(fields("Sandoval Acosta Luis Fernándo", "1712345678"));
    const marzo = employeeKey(fields("SANDOVAL ACOSTA LUIS FERNANDO", "1712345678"));

    expect(febrero).toBe(marzo);
  });

  it("ignora los espacios de sobra de una cédula", () => {
    expect(employeeKey(fields("A", " 1712345678 "))).toBe(employeeKey(fields("A", "1712345678")));
  });

  it("separa a dos personas con el mismo nombre y distinta cédula", () => {
    // Without this two namesakes would add up in one row, which is the invisible failure.
    const uno = employeeKey(fields("JUAN PEREZ", "1712345678"));
    const otro = employeeKey(fields("JUAN PEREZ", "0912345678"));

    expect(uno).not.toBe(otro);
  });

  it("cae al nombre cuando la ficha no trae cédula", () => {
    // The importer writes whatever the file says, without requiring it.
    const enero = employeeKey(fields("MARIA LOPEZ", ""));
    const febrero = employeeKey(fields("maría lópez", "  "));

    expect(enero).toBe(febrero);
    expect(enero).not.toBeNull();
  });

  it("no funde una ficha sin cédula con una que sí la declara", () => {
    // They are two different pieces of evidence: matching on the name is not claiming they are the
    // same person.
    const conCedula = employeeKey(fields("MARIA LOPEZ", "1712345678"));
    const sinCedula = employeeKey(fields("MARIA LOPEZ", ""));

    expect(conCedula).not.toBe(sinCedula);
  });

  it("devuelve null sin cédula y sin nombre", () => {
    expect(employeeKey(fields("   ", ""))).toBeNull();
  });
});
