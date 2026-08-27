import { describe, expect, it } from "vitest";
import { computeEmployeePayroll } from "./engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import type { CapturedDeductions } from "./engine/types";
import { emptyCapture, toEngineInput } from "./employee-input";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "./types";

const NO_DEDUCTIONS: CapturedDeductions = {
  iessLoans: 0,
  unpaidLeave: 0,
  salaryAdvance: 0,
  companyLoans: 0,
  incomeTax: 0,
  meals: 0,
  fines: 0,
  inHouseConsumption: 0,
  solidarityContribution: 0,
  otherDeductions: 0,
  partTimeDeduction: 0,
  medicalLeaveDeduction: 0,
};

function capture(overrides: Partial<PayrollMonthlyCapture> = {}): PayrollMonthlyCapture {
  return {
    overtimeHours50: 0,
    overtimeHours100: 0,
    overtimeHours25: 0,
    approvedOvertime: null,
    vacationPay: 0,
    privateInsurance: 0,
    allowances: 0,
    fixedCommission: 0,
    variableCommission: 0,
    bonus: 0,
    deductions: { ...NO_DEDUCTIONS },
    paid: null,
    ...overrides,
  };
}

function line(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: "e1",
    periodId: "p1",
    name: "MORALES MENA SILVIA JIMENA",
    role: "CAMARERA DE PISOS",
    area: "HOSPEDAJE",
    baseSalary: 487.21,
    contractType: "CT",
    idCard: "1714097084",
    hireDate: "2025-10-07",
    sectorCode: "1608551004134",
    hasReserveFund: false,
    accumulatesReserveFund: true,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    ...overrides,
  };
}

describe("toEngineInput", () => {
  it("SIN captura calcula igual, tratando lo capturado como cero", () => {
    // The app has to work with no Excel: a nómina created by hand or copied from the previous month
    // already has a base salary, days and contract type, and with that the rol is computed whole.
    // Returning `null` here left the screen blank in exactly the main use case.
    const input = toEngineInput(line());

    expect(input.baseSalary).toBe(487.21);
    expect(input.days).toBe(30);
    expect(input.overtimeHours50).toBe(0);
    expect(input.approvedOvertime).toBeNull();
    expect(input.deductions.salaryAdvance).toBe(0);
  });

  it("sin captura, un empleado ya tiene su rol completo", () => {
    // MORALES' figures with no capture at all: their unified salary, their two décimos, their IESS
    // contribution and what they cost the company all come out of the record.
    const computed = computeEmployeePayroll(toEngineInput(line()), DEFAULT_PAYROLL_PARAMETERS);

    expect(computed.unifiedSalary).toBe(487.21);
    expect(computed.fourteenthMonthly).toBe(40.17);
    expect(computed.thirteenthMonthly).toBe(40.6);
    expect(computed.grossIncome).toBe(567.98);
    expect(computed.iessEmployee).toBe(46.04);
    expect(computed.netPay).toBe(521.94);
    expect(computed.employerCost).toBe(649.15);
  });

  it("una captura vacía y ninguna captura dan exactamente lo mismo", () => {
    expect(toEngineInput(line({ capture: emptyCapture() }))).toEqual(toEngineInput(line()));
  });

  it("cruza la ficha con lo capturado del mes", () => {
    const input = toEngineInput(line({ capture: capture({ overtimeHours50: 5.5 }) }));

    expect(input.baseSalary).toBe(487.21);
    expect(input.days).toBe(30);
    expect(input.contractType).toBe("CT");
    expect(input.overtimeHours50).toBe(5.5);
  });

  it("las dos banderas del fondo de reserva vienen de la FICHA, no del mes", () => {
    // They belong to the employee (seniority and their own choice), not to the período. If they
    // travelled in the capture, copying the previous month's nómina would lose them.
    const input = toEngineInput(
      line({ hasReserveFund: true, accumulatesReserveFund: false, capture: capture() }),
    );
    expect(input.hasReserveFund).toBe(true);
    expect(input.accumulatesReserveFund).toBe(false);
  });

  it("`paid` sale de la captura, y es null mientras nadie lo declare", () => {
    // It belongs to the MONTH and it is TYPED, so it does not matter whether whoever assembles the
    // rol wrote it or a file's `BZ` brought it: to the engine they are the same thing, and that is
    // why a manual creation reconciles.
    expect(toEngineInput(line({ capture: capture() })).paid).toBeNull();
    expect(toEngineInput(line({ capture: capture({ paid: 457.69 }) })).paid).toBe(457.69);
    expect(toEngineInput(line()).paid).toBeNull();
  });

  it("las provisiones viajan a las banderas del motor desde la FICHA, no desde la captura", () => {
    const input = toEngineInput(
      line({ provisionsThirteenth: true, provisionsFourteenth: true, capture: capture() }),
    );
    expect(input.flags).toEqual({ provisionsThirteenth: true, provisionsFourteenth: true });
  });

  it("una línea SIN captura conserva sus provisiones: no son del mes", () => {
    // It is what makes a freshly copied nómina provision from the first render, without anyone
    // marking anything again.
    const input = toEngineInput(line({ provisionsThirteenth: true }));
    expect(input.flags).toEqual({ provisionsThirteenth: true, provisionsFourteenth: false });
  });

  it("no comparte referencias con la línea: mutar el resultado no toca lo guardado", () => {
    const stored = line({ capture: capture() });
    const input = toEngineInput(stored);
    input.deductions.salaryAdvance = 999;
    expect(stored.capture?.deductions.salaryAdvance).toBe(0);
  });

  it("reproduce el rol real de MORALES de punta a punta", () => {
    // The complete case: record + capture → engine → the figures the accountant's file brings.
    const input = toEngineInput(
      line({
        capture: capture({
          overtimeHours50: 5.5,
          approvedOvertime: 0, // `M15` trae `*0`
          deductions: { ...NO_DEDUCTIONS, iessLoans: 64.25 },
          paid: 457.69,
        }),
      }),
    );
    const result = computeEmployeePayroll(input, DEFAULT_PAYROLL_PARAMETERS);

    expect(result.overtimePay50).toBe(16.75);
    expect(result.overtimeTotal).toBe(0);
    expect(result.grossIncome).toBe(567.98);
    expect(result.netPay).toBe(457.69000000000005);
    expect(result.employerCost).toBe(649.15);
    expect(result.difference).toBe(0);
  });
});

describe("emptyCapture", () => {
  it("es todo ceros y sin recorte de horas extras", () => {
    const empty = emptyCapture();
    expect(empty.approvedOvertime).toBeNull();
    expect(empty.overtimeHours50).toBe(0);
    for (const value of Object.values(empty.deductions)) {
      expect(value).toBe(0);
    }
  });

  it("devuelve un objeto NUEVO cada vez", () => {
    // Sharing a constant would let editing one employee move another's figures.
    const a = emptyCapture();
    a.deductions.fines = 50;
    expect(emptyCapture().deductions.fines).toBe(0);
  });
});
