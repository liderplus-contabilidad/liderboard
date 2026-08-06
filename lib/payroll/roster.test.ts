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

  it("no arrastra nada de lo que es del mes: la ficha copiada solo tiene sus 9 campos", () => {
    const [copied] = copyRoster([line()]);
    expect(Object.keys(copied).sort()).toEqual(
      [
        "area",
        "baseSalary",
        "contractType",
        "days",
        "hireDate",
        "idCard",
        "name",
        "role",
        "sectorCode",
      ].sort(),
    );
  });

  it("copia varias líneas manteniendo el orden", () => {
    const result = copyRoster([line({ name: "Ana Torres" }), line({ name: "Luis Vera" })]);
    expect(result.map((l) => l.name)).toEqual(["Ana Torres", "Luis Vera"]);
  });

  it("una fuente vacía copia vacío", () => {
    expect(copyRoster([])).toEqual([]);
  });
});
