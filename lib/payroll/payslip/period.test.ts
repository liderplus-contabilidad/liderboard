import { describe, expect, it } from "vitest";
import { emptyCapture } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeLine, PayrollPeriod } from "../types";
import { buildPeriodPayslips } from "./period";

const PERIOD: PayrollPeriod = {
  id: "p1",
  clientId: "c1",
  year: 2026,
  monthIndex: 2,
  kind: "ordinario",
};

function employee(id: string, name: string): PayrollEmployeeLine {
  return {
    id,
    periodId: "p1",
    name,
    role: "RECEPCIONISTA",
    area: "VENTAS",
    baseSalary: 487.21,
    contractType: "CT",
    idCard: `172322006${id}`,
    hireDate: "2026-02-16",
    sectorCode: "",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    capture: emptyCapture(),
  };
}

const build = (lines: readonly PayrollEmployeeLine[], clientName = "CULTURA MANOR") =>
  buildPeriodPayslips({
    period: PERIOD,
    lines,
    parameters: DEFAULT_PAYROLL_PARAMETERS,
    clientName,
  });

describe("los comprobantes de un período", () => {
  it("son uno por empleado, en el orden de la nómina", () => {
    const docs = build([employee("1", "ALFA"), employee("2", "BRAVO"), employee("3", "CHARLIE")]);
    expect(docs.map((d) => d.employeeName)).toEqual(["ALFA", "BRAVO", "CHARLIE"]);
  });

  it("numera el `Codigo:` por la posición en la nómina, desde 1", () => {
    // Es lo que el libro llama `Codigo:` — un contador por orden, no un identificador estable.
    const docs = build([employee("9", "ALFA"), employee("4", "BRAVO")]);
    expect(docs.map((d) => d.codeLine)).toEqual(["Codigo: 1", "Codigo: 2"]);
  });

  it("todos llevan el período y el cliente abiertos", () => {
    const docs = build([employee("1", "ALFA"), employee("2", "BRAVO")]);
    for (const doc of docs) {
      expect(doc.period).toBe("MES: MARZO 2026");
      expect(doc.company).toBe("CULTURA MANOR");
    }
  });

  it("lleva el logo del cliente cuando lo hay, y no inventa la clave cuando no", () => {
    const logo = {
      dataUrl: "data:image/png;base64,SGk=",
      mime: "image/png" as const,
      width: 8,
      height: 4,
    };
    const [withLogo] = buildPeriodPayslips({
      period: PERIOD,
      lines: [employee("1", "ALFA")],
      parameters: DEFAULT_PAYROLL_PARAMETERS,
      clientName: "CULTURA MANOR",
      clientLogo: logo,
    });
    expect(withLogo.logo).toEqual(logo);
    expect(build([employee("1", "ALFA")])[0]).not.toHaveProperty("logo");
  });

  it("una nómina vacía no produce ningún comprobante", () => {
    // Es lo que apaga el control de descarga: sin nómina no hay papel que bajar.
    expect(build([])).toEqual([]);
  });

  it("saca las cifras del motor, no de lo guardado", () => {
    const docs = build([employee("1", "ALFA")]);
    expect(docs[0].incomes.find((row) => row.label === "SUELDO UNIFICADO")?.value).toBe("$487.21");
    expect(docs[0].netPay).toBe("$521.94");
  });
});
