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
    provisionsThirteenth: false,
    provisionsFourteenth: false,
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
    days: 30,
    ...overrides,
  };
}

describe("toEngineInput", () => {
  it("SIN captura calcula igual, tratando lo capturado como cero", () => {
    // La app tiene que servir sin Excel: una nómina creada a mano o copiada del mes anterior ya
    // tiene sueldo base, días y tipo de contrato, y con eso el rol se calcula entero. Devolver
    // `null` aquí dejaba la pantalla en blanco justo en el caso de uso principal.
    const input = toEngineInput(line());

    expect(input.baseSalary).toBe(487.21);
    expect(input.days).toBe(30);
    expect(input.overtimeHours50).toBe(0);
    expect(input.approvedOvertime).toBeNull();
    expect(input.deductions.salaryAdvance).toBe(0);
  });

  it("sin captura, un empleado ya tiene su rol completo", () => {
    // Las cifras de MORALES sin ninguna captura: su sueldo unificado, sus dos décimos, su aporte
    // al IESS y el costo que le supone a la empresa salen todos de la ficha.
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
    // Son del empleado (antigüedad y su propia elección), no del período. Si viajaran en la
    // captura, copiar la nómina del mes anterior las perdería.
    const input = toEngineInput(
      line({ hasReserveFund: true, accumulatesReserveFund: false, capture: capture() }),
    );
    expect(input.hasReserveFund).toBe(true);
    expect(input.accumulatesReserveFund).toBe(false);
  });

  it("`paid` sale de las cifras del archivo, y es null cuando el archivo no lo declara", () => {
    expect(toEngineInput(line({ capture: capture() }))?.paid).toBeNull();

    const conPagado = toEngineInput(
      line({
        capture: capture(),
        figures: { gross: 567.98, deductions: 110.29, net: 457.69, cost: 649.15, paid: 457.69 },
      }),
    );
    expect(conPagado.paid).toBe(457.69);

    const sinPagado = toEngineInput(
      line({
        capture: capture(),
        figures: { gross: 567.98, deductions: 110.29, net: 457.69, cost: 649.15, paid: null },
      }),
    );
    expect(sinPagado.paid).toBeNull();
  });

  it("las provisiones viajan a las banderas del motor", () => {
    const input = toEngineInput(
      line({ capture: capture({ provisionsThirteenth: true, provisionsFourteenth: true }) }),
    );
    expect(input.flags).toEqual({ provisionsThirteenth: true, provisionsFourteenth: true });
  });

  it("no comparte referencias con la línea: mutar el resultado no toca lo guardado", () => {
    const stored = line({ capture: capture() });
    const input = toEngineInput(stored);
    input.deductions.salaryAdvance = 999;
    expect(stored.capture?.deductions.salaryAdvance).toBe(0);
  });

  it("reproduce el rol real de MORALES de punta a punta", () => {
    // El caso completo: ficha + captura → motor → las cifras que el archivo del contador trae.
    const input = toEngineInput(
      line({
        capture: capture({
          overtimeHours50: 5.5,
          approvedOvertime: 0, // `M15` trae `*0`
          deductions: { ...NO_DEDUCTIONS, iessLoans: 64.25 },
        }),
        figures: { gross: 567.98, deductions: 110.29, net: 457.69, cost: 649.15, paid: 457.69 },
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
    expect(empty.provisionsThirteenth).toBe(false);
    for (const value of Object.values(empty.deductions)) {
      expect(value).toBe(0);
    }
  });

  it("devuelve un objeto NUEVO cada vez", () => {
    // Compartir una constante dejaría que editar un empleado moviera las cifras de otro.
    const a = emptyCapture();
    a.deductions.fines = 50;
    expect(emptyCapture().deductions.fines).toBe(0);
  });
});
