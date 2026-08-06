import { describe, expect, it } from "vitest";
import { copyRoster } from "./roster";
import type { PayrollEmployeeLine } from "./types";

function line(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: "line-1",
    periodId: "period-1",
    name: "Ana Torres",
    role: "Recepcionista",
    area: "ADMINISTRACION",
    baseSalary: 460,
    contractType: "CT",
    idCard: "0102030405",
    hireDate: "2024-03-01",
    sectorCode: "S001",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    days: 15, // un ingreso a mitad de mes: NO debe sobrevivir a la copia
    ...overrides,
  };
}

describe("copyRoster", () => {
  it("arrastra la ficha, campo por campo", () => {
    const [copied] = copyRoster([line()]);
    expect(copied.name).toBe("Ana Torres");
    expect(copied.role).toBe("Recepcionista");
    expect(copied.area).toBe("ADMINISTRACION");
    expect(copied.baseSalary).toBe(460);
    expect(copied.contractType).toBe("CT");
    expect(copied.idCard).toBe("0102030405");
    expect(copied.hireDate).toBe("2024-03-01");
    expect(copied.sectorCode).toBe("S001");
  });

  it("resetea `days` a 30 — el default se corrige al capturar, no se arrastra del mes anterior", () => {
    const [copied] = copyRoster([line({ days: 15 })]);
    expect(copied.days).toBe(30);

    const [fullTime] = copyRoster([line({ days: 30 })]);
    expect(fullTime.days).toBe(30);
  });

  it("no arrastra `id` ni `periodId`: la línea copiada no tiene dueño todavía", () => {
    const [copied] = copyRoster([line()]);
    expect(copied).not.toHaveProperty("id");
    expect(copied).not.toHaveProperty("periodId");
  });

  it("no arrastra nada de lo que es del mes: la ficha copiada solo tiene sus 11 campos", () => {
    // Este test es la frontera de la copia escrita como lista cerrada, a propósito: cualquier
    // campo nuevo de `PayrollEmployeeLine` obliga a decidir aquí, explícitamente, si es de la
    // ficha o del mes. Sin él, un campo del MES entraría en la copia sin que nada lo delate y
    // abril heredaría las horas extras de marzo.
    const [copied] = copyRoster([line()]);
    expect(Object.keys(copied).sort()).toEqual(
      [
        "accumulatesReserveFund",
        "area",
        "baseSalary",
        "contractType",
        "days",
        "hasReserveFund",
        "hireDate",
        "idCard",
        "name",
        "role",
        "sectorCode",
      ].sort(),
    );
  });

  it("NO copia la captura del mes: el período nuevo nace sin archivo", () => {
    // Ausente, no en ceros. Un `capture` vacío haría que la pantalla pintara un rol completo
    // —con su décimo cuarto y su costo empresa— de un mes que nadie cargó todavía.
    const [copied] = copyRoster([
      line({
        capture: {
          overtimeHours50: 12,
          overtimeHours100: 0,
          overtimeHours25: 0,
          approvedOvertime: 0,
          vacationPay: 0,
          privateInsurance: 0,
          allowances: 0,
          fixedCommission: 0,
          variableCommission: 0,
          bonus: 0,
          deductions: {
            iessLoans: 0,
            unpaidLeave: 0,
            salaryAdvance: 200,
            companyLoans: 0,
            incomeTax: 0,
            meals: 0,
            fines: 0,
            inHouseConsumption: 0,
            solidarityContribution: 0,
            otherDeductions: 0,
            partTimeDeduction: 0,
            medicalLeaveDeduction: 0,
          },
          provisionsThirteenth: false,
          provisionsFourteenth: false,
          paid: null,
        },
      }),
    ]);
    expect("capture" in copied).toBe(false);
  });

  it("SÍ copia las dos banderas del fondo de reserva, que son de la ficha", () => {
    const [copied] = copyRoster([line({ hasReserveFund: true, accumulatesReserveFund: true })]);
    expect(copied.hasReserveFund).toBe(true);
    expect(copied.accumulatesReserveFund).toBe(true);
  });

  it("copia varias líneas manteniendo el orden", () => {
    const result = copyRoster([line({ name: "Ana Torres" }), line({ name: "Luis Vera" })]);
    expect(result.map((l) => l.name)).toEqual(["Ana Torres", "Luis Vera"]);
  });

  it("una fuente vacía copia vacío", () => {
    expect(copyRoster([])).toEqual([]);
  });
});
