import { describe, expect, it } from "vitest";
import { emptyCapture } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { ParsedPayrollEmployeeLine, PayrollExtraConcept } from "../types";
import { columnIndexOf } from "./columns";
import { buildRolGrid, periodText, type RolExportGrid, type RolExportRow } from "./rol-grid";

function employee(
  name: string,
  area: string,
  overrides: Partial<ParsedPayrollEmployeeLine> = {},
): ParsedPayrollEmployeeLine {
  return {
    name,
    role: "CARGO",
    area,
    baseSalary: 480,
    contractType: "CT",
    idCard: "1700000000",
    hireDate: "2025-11-01",
    sectorCode: "1608551004134",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    days: 30,
    capture: emptyCapture(),
    ...overrides,
  };
}

function build(
  lines: readonly ParsedPayrollEmployeeLine[],
  extraConcepts: readonly PayrollExtraConcept[] = [],
): RolExportGrid {
  return buildRolGrid({
    clientName: "HOTEL DE PRUEBA",
    year: 2026,
    monthIndex: 2,
    lines,
    parameters: DEFAULT_PAYROLL_PARAMETERS,
    extraConcepts,
  });
}

const at = (row: RolExportRow, letter: string) => row.cells[columnIndexOf(letter)];
const kinds = (grid: RolExportGrid) => grid.rows.map((row) => row.kind);

describe("el preámbulo", () => {
  it("declara la empresa y el período en la forma que el lector reconoce", () => {
    const grid = build([employee("ALFA", "COCINA")]);
    expect(at(grid.rows[0], "B")).toBe("HOTEL DE PRUEBA");
    expect(at(grid.rows[1], "B")).toBe("MARZO 2026");
    expect(periodText(2025, 0)).toBe("ENERO 2025");
  });

  it("reparte los rótulos en dos filas, con los agrupadores de horas extras arriba", () => {
    const [, top, bottom] = build([employee("ALFA", "COCINA")]).rows;
    expect(at(top, "G")).toBe(" No. HORAS EXTRAS");
    expect(at(top, "J")).toBe("VALOR DE HORAS EXTRAS");
    expect(at(top, "M")).toBe("TOTAL HORAS EXTRAS");
    expect(at(top, "AY")).toBe("COSTO TOTAL");
    expect(at(bottom, "A")).toBe("No. ");
    expect(at(bottom, "B")).toBe("EMPLEADO");
    expect(at(bottom, "I")).toBe("HORAS EXTRAS 15%");
    // El rótulo real de `G` va DEBAJO del agrupador, que es lo que obliga al lector a comparar por
    // la etiqueta entera.
    expect(at(bottom, "G")).toBe("HORAS EXTRAS 50%");
  });
});

describe("el cuerpo", () => {
  it("apila cabecera de área, empleados y subtotal, y cierra con SUMAN", () => {
    const grid = build([
      employee("ALFA", "HOSPEDAJE"),
      employee("BETA", "HOSPEDAJE"),
      employee("GAMMA", "COCINA"),
    ]);
    expect(kinds(grid)).toEqual([
      "company",
      "labels",
      "labels",
      "area",
      "employee",
      "employee",
      "subtotal",
      "area",
      "employee",
      "subtotal",
      "suman",
    ]);
    expect(at(grid.rows[3], "B")).toBe("HOSPEDAJE");
    expect(at(grid.rows[6], "C")).toBe("SUBTOTAL");
    expect(at(grid.rows[10], "C")).toBe("SUMAN");
  });

  it("corre el ordinal a lo largo de todas las áreas", () => {
    const grid = build([
      employee("ALFA", "HOSPEDAJE"),
      employee("BETA", "COCINA"),
      employee("GAMMA", "COCINA"),
    ]);
    const employees = grid.rows.filter((row) => row.kind === "employee");
    expect(employees.map((row) => at(row, "A"))).toEqual([1, 2, 3]);
  });

  it("una fila de área no lleva ordinal, que es lo que la distingue de un empleado", () => {
    const grid = build([employee("ALFA", "HOSPEDAJE")]);
    const area = grid.rows.find((row) => row.kind === "area");
    expect(at(area!, "A")).toBeNull();
  });

  it("agrupa por área ignorando mayúsculas, y encabeza con la primera grafía", () => {
    const grid = build([employee("ALFA", "Cocina"), employee("BETA", "COCINA")]);
    expect(grid.rows.filter((row) => row.kind === "area")).toHaveLength(1);
    expect(at(grid.rows[3], "B")).toBe("Cocina");
  });

  it("pone a los empleados sin área los primeros y SIN cabecera", () => {
    // Una cabecera en blanco no se reconocería al releer el archivo, y esos empleados heredarían el
    // área del bloque anterior: quedarían archivados bajo un área que no es la suya.
    const grid = build([employee("ALFA", "COCINA"), employee("HUERFANO", "")]);
    expect(kinds(grid)).toEqual([
      "company",
      "labels",
      "labels",
      "employee",
      "subtotal",
      "area",
      "employee",
      "subtotal",
      "suman",
    ]);
    expect(at(grid.rows[3], "B")).toBe("HUERFANO");
  });
});

describe("los totales", () => {
  it("cada SUBTOTAL suma su bloque y SUMAN suma la hoja", () => {
    const grid = build([
      employee("ALFA", "HOSPEDAJE", { baseSalary: 500 }),
      employee("BETA", "HOSPEDAJE", { baseSalary: 300 }),
      employee("GAMMA", "COCINA", { baseSalary: 200 }),
    ]);
    const subtotals = grid.rows.filter((row) => row.kind === "subtotal");
    expect(at(subtotals[0], "D")).toBe(800);
    expect(at(subtotals[1], "D")).toBe(200);
    expect(at(grid.rows.at(-1)!, "D")).toBe(1000);
  });

  it("no totaliza los días ni la identidad", () => {
    const grid = build([employee("ALFA", "COCINA"), employee("BETA", "COCINA")]);
    const suman = grid.rows.at(-1)!;
    expect(at(suman, "E")).toBeNull();
    expect(at(suman, "B")).toBeNull();
    expect(at(suman, "BB")).toBeNull();
  });

  it("una columna donde nadie puso un número queda VACÍA, no en cero", () => {
    // `PAGADO` sin declarar: un cero afirmaría que se pagó cero, que no es lo mismo que «nadie lo
    // declaró todavía».
    const grid = build([employee("ALFA", "COCINA")]);
    expect(at(grid.rows.at(-1)!, "BZ")).toBeNull();
  });

  it("con lo pagado declarado, lo suma", () => {
    const grid = build([
      employee("ALFA", "COCINA", { capture: { ...emptyCapture(), paid: 100 } }),
      employee("BETA", "COCINA", { capture: { ...emptyCapture(), paid: 50 } }),
    ]);
    expect(at(grid.rows.at(-1)!, "BZ")).toBe(150);
  });
});

describe("la fila de un empleado", () => {
  const grid = build([
    employee("ALFA", "COCINA", {
      baseSalary: 487.21,
      contractType: "TP",
      idCard: "1714097084",
      hasReserveFund: true,
      accumulatesReserveFund: false,
      capture: { ...emptyCapture(), paid: 400 },
    }),
  ]);
  const row = grid.rows.find((entry) => entry.kind === "employee")!;

  it("escribe la identidad como la escribe el libro", () => {
    expect(at(row, "B")).toBe("ALFA");
    expect(at(row, "D")).toBe(487.21);
    expect(at(row, "AZ")).toBe("N");
    expect(at(row, "BA")).toBe("S");
    expect(at(row, "BB")).toBe("TP");
    expect(at(row, "BD")).toBe("1714097084");
    expect(at(row, "BG")).toBe("ALFA");
  });

  it("la fecha de ingreso va como fecha de MEDIANOCHE LOCAL", () => {
    // Con medianoche UTC, exceljs le resta el desfase horario y el serial baja un día entero.
    const hired = at(row, "BC") as Date;
    expect(hired).toBeInstanceOf(Date);
    expect([hired.getFullYear(), hired.getMonth(), hired.getDate()]).toEqual([2025, 10, 1]);
    expect([hired.getHours(), hired.getMinutes()]).toEqual([0, 0]);
  });

  it("deja vacías las columnas que la app no guarda", () => {
    for (const letter of ["AJ", "AK", "AL", "AM", "AQ", "AR", "BE"]) {
      expect(at(row, letter), letter).toBeNull();
    }
  });

  it("el líquido va en AP y se repite en el bloque del banco", () => {
    expect(at(row, "BH")).toBe(at(row, "AP"));
  });

  it("la diferencia es el líquido contra lo pagado, en ese orden", () => {
    // `CA = AP − BZ`, como en el libro: la fila que cobró de más sale en negativo.
    expect(at(row, "CA")).toBeCloseTo((at(row, "AP") as number) - 400, 10);
  });
});

describe("los conceptos extra", () => {
  const concepts: PayrollExtraConcept[] = [
    { id: "mov", label: "MOVILIZACION", kind: "aportable" },
    { id: "ali", label: "ALIMENTACION", kind: "noAportable" },
  ];

  it("añaden UNA columna agregada al final, y el total de ingreso los incluye", () => {
    const line = employee("ALFA", "COCINA", {
      capture: { ...emptyCapture(), extraAmounts: { mov: 50, ali: 30 } },
    });
    const grid = build([line], concepts);
    const row = grid.rows.find((entry) => entry.kind === "employee")!;
    expect(at(row, "CB")).toBe(80);

    // El total sube 80 MÁS el décimo tercero de la mitad aportable (50/12): los extras no son un
    // añadido al final de la suma, entran en las bases. Es justo por eso que la columna tiene que
    // salir en la hoja — sin ella, `W` traería 84,17 que ninguna columna explica.
    const sinExtras = build([line]).rows.find((entry) => entry.kind === "employee")!;
    expect(at(row, "W") as number).toBeCloseTo((at(sinExtras, "W") as number) + 80 + 50 / 12, 2);
  });

  it("sin conceptos declarados, la hoja termina donde termina el libro", () => {
    const grid = build([employee("ALFA", "COCINA")]);
    expect(grid.columns.some((column) => column.letter === "CB")).toBe(false);
    expect(grid.rows[0].cells).toHaveLength(columnIndexOf("CA") + 1);
  });
});
