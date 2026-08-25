import { describe, expect, it } from "vitest";
import { payslipBatchFilename, payslipFilename, payslipZipEntryNames } from "./download";

describe("payslipFilename", () => {
  it("lleva el período y el nombre sin tildes ni signos", () => {
    expect(payslipFilename(2026, 2, "SORIA CHALA MISHELL FERNANDA")).toBe(
      "Rol-2026-03-SORIA-CHALA-MISHELL-FERNANDA.pdf",
    );
    expect(payslipFilename(2026, 11, "PEÑA GARCÍA, JOSÉ")).toBe("Rol-2026-12-PENA-GARCIA-JOSE.pdf");
  });
});

describe("payslipBatchFilename", () => {
  it("es un .zip, porque dentro va un PDF por empleado", () => {
    expect(payslipBatchFilename(2026, 6)).toBe("Rol-2026-07-comprobantes.zip");
  });
});

describe("payslipZipEntryNames", () => {
  it("da un archivo por empleado, en el orden de la nómina", () => {
    expect(
      payslipZipEntryNames(
        ["COBA ORTIZ EDGAR", "LANDA MISE BYRON", "ORTEGA GARCIA JENNIFER"],
        2026,
        6,
      ),
    ).toEqual([
      "Rol-2026-07-COBA-ORTIZ-EDGAR.pdf",
      "Rol-2026-07-LANDA-MISE-BYRON.pdf",
      "Rol-2026-07-ORTEGA-GARCIA-JENNIFER.pdf",
    ]);
  });

  // Sin esto el extractor pisa el primero en silencio y una de las dos personas se queda sin
  // comprobante — un fallo que nadie ve, porque el .zip se abre y parece completo.
  it("dos empleados del mismo nombre no comparten archivo: desempata la posición en la nómina", () => {
    expect(payslipZipEntryNames(["JUAN PEREZ", "ANA LOPEZ", "JUAN PEREZ"], 2026, 2)).toEqual([
      "Rol-2026-03-JUAN-PEREZ.pdf",
      "Rol-2026-03-ANA-LOPEZ.pdf",
      "Rol-2026-03-JUAN-PEREZ-3.pdf",
    ]);
  });

  it("tres veces el mismo nombre siguen siendo tres archivos distintos", () => {
    expect(payslipZipEntryNames(["JUAN PEREZ", "JUAN PEREZ", "JUAN PEREZ"], 2026, 2)).toEqual([
      "Rol-2026-03-JUAN-PEREZ.pdf",
      "Rol-2026-03-JUAN-PEREZ-2.pdf",
      "Rol-2026-03-JUAN-PEREZ-3.pdf",
    ]);
  });

  // El desempate se busca hasta encontrar hueco: aquí el `-2` que le tocaría al segundo ya es el
  // nombre de otro empleado, así que sigue en vez de pisarlo.
  it("un desempate que choca con un nombre real sigue buscando", () => {
    expect(payslipZipEntryNames(["JUAN PEREZ", "JUAN PEREZ", "JUAN PEREZ 2"], 2026, 2)).toEqual([
      "Rol-2026-03-JUAN-PEREZ.pdf",
      "Rol-2026-03-JUAN-PEREZ-2.pdf",
      "Rol-2026-03-JUAN-PEREZ-2-3.pdf",
    ]);
  });

  it("sin empleados no hay ningún archivo", () => {
    expect(payslipZipEntryNames([], 2026, 2)).toEqual([]);
  });
});
