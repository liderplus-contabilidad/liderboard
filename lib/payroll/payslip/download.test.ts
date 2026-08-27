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

  // Without this the extractor silently overwrites the first one and one of the two people is left
  // with no payslip — a failure nobody sees, because the .zip opens and looks complete.
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

  // The tie-break is searched until a free slot is found: here the `-2` the second one would get is
  // already another employee's name, so it carries on instead of overwriting it.
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
