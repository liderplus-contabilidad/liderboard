import { describe, expect, it } from "vitest";
import { employeeKey } from "./identity";

function fields(name: string, idCard: string) {
  return { name, idCard };
}

describe("employeeKey", () => {
  it("agrupa por cédula aunque el nombre esté escrito de otra manera", () => {
    // El caso real: el archivo de un mes grita el nombre y el de otro lo escribe con acentos.
    const febrero = employeeKey(fields("Sandoval Acosta Luis Fernándo", "1712345678"));
    const marzo = employeeKey(fields("SANDOVAL ACOSTA LUIS FERNANDO", "1712345678"));

    expect(febrero).toBe(marzo);
  });

  it("ignora los espacios de sobra de una cédula", () => {
    expect(employeeKey(fields("A", " 1712345678 "))).toBe(employeeKey(fields("A", "1712345678")));
  });

  it("separa a dos personas con el mismo nombre y distinta cédula", () => {
    // Sin esto dos homónimos se sumarían en una fila, que es el fallo invisible.
    const uno = employeeKey(fields("JUAN PEREZ", "1712345678"));
    const otro = employeeKey(fields("JUAN PEREZ", "0912345678"));

    expect(uno).not.toBe(otro);
  });

  it("cae al nombre cuando la ficha no trae cédula", () => {
    // El importador escribe lo que diga el archivo, sin exigirla.
    const enero = employeeKey(fields("MARIA LOPEZ", ""));
    const febrero = employeeKey(fields("maría lópez", "  "));

    expect(enero).toBe(febrero);
    expect(enero).not.toBeNull();
  });

  it("no funde una ficha sin cédula con una que sí la declara", () => {
    // Son dos evidencias distintas: coincidir en el nombre no es afirmar que son la misma persona.
    const conCedula = employeeKey(fields("MARIA LOPEZ", "1712345678"));
    const sinCedula = employeeKey(fields("MARIA LOPEZ", ""));

    expect(conCedula).not.toBe(sinCedula);
  });

  it("devuelve null sin cédula y sin nombre", () => {
    expect(employeeKey(fields("   ", ""))).toBeNull();
  });
});
