import { describe, expect, it } from "vitest";
import { emptyCapture } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { ParsedPayrollEmployeeLine } from "../types";
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
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    capture: emptyCapture(),
    ...overrides,
  };
}

function build(
  lines: readonly ParsedPayrollEmployeeLine[],
  company?: typeof COMPANY,
): RolExportGrid {
  return buildRolGrid({
    clientName: "HOTEL DE PRUEBA",
    ...(company ? { company } : {}),
    year: 2026,
    monthIndex: 2,
    lines,
    parameters: DEFAULT_PAYROLL_PARAMETERS,
  });
}

/** The client's real file profile. */
const COMPANY = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
};

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
    // `G`'s real label goes UNDER the grouper, which is what forces the reader to compare by the
    // whole label.
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
    // A blank header would not be recognised on re-reading the file, and those employees would
    // inherit the previous block's area: they would end up filed under an area that is not theirs.
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
    // `PAGADO` undeclared: a zero would claim zero was paid, which is not the same as «nobody has
    // declared it yet».
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
    // With UTC midnight, exceljs subtracts the time-zone offset and the serial drops a whole day.
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
    // `CA = AP − BZ`, as in the book: the row that was overpaid comes out negative.
    expect(at(row, "CA")).toBeCloseTo((at(row, "AP") as number) - 400, 10);
  });
});

describe("las filas de bono", () => {
  it("añaden UNA columna agregada al final, y el total de ingreso los incluye", () => {
    const line = employee("ALFA", "COCINA", {
      capture: {
        ...emptyCapture(),
        extras: [
          { id: "mov", label: "MOVILIZACION", kind: "aportable", amount: 50 },
          { id: "ali", label: "ALIMENTACION", kind: "noAportable", amount: 30 },
        ],
      },
    });
    const grid = build([line]);
    const row = grid.rows.find((entry) => entry.kind === "employee")!;
    expect(at(row, "CB")).toBe(80);

    // The total rises by 80 PLUS the décimo tercero of the contributory half (50/12): the bonuses are
    // not an addendum at the end of the sum, they enter the bases. That is precisely why the column
    // has to come out on the sheet — without it, `W` would bring 84.17 that no column explains.
    const sinExtras = build([employee("ALFA", "COCINA")]).rows.find(
      (entry) => entry.kind === "employee",
    )!;
    expect(at(row, "W") as number).toBeCloseTo((at(sinExtras, "W") as number) + 80 + 50 / 12, 2);
  });

  it("la cabecera de `AH` es la del LIBRO aunque el empleado la haya rotulado", () => {
    // The letter is the contract the accountant checks against, and a column has ONE header: the
    // row's own name lives on the screen and on the payslip, not on the sheet.
    const base = emptyCapture();
    const line = employee("ALFA", "COCINA", {
      capture: {
        ...base,
        labels: { "E-11": "Uniformes" },
        deductions: { ...base.deductions, otherDeductions: 36 },
      },
    });
    const grid = build([line]);
    const labels = grid.rows.filter((row) => row.kind === "labels");
    // `OTROS ` with the spare space the book writes: the header goes VERBATIM.
    expect(labels.some((row) => at(row, "AH") === "OTROS ")).toBe(true);
    expect(
      at(
        grid.rows.find((row) => row.kind === "employee")!,
        "AH",
      ),
    ).toBe(36);
  });

  it("sin filas de bono, la hoja termina donde termina el libro", () => {
    const grid = build([employee("ALFA", "COCINA")]);
    expect(grid.columns.some((column) => column.letter === "CB")).toBe(false);
    expect(grid.rows[0].cells).toHaveLength(columnIndexOf("CA") + 1);
  });
});

describe("el membrete del cliente", () => {
  const lines = [employee("ALFA", "COCINA"), employee("BETA", "VENTAS")];

  it("escribe sus líneas en `B`, bajo el nombre y encima de los rótulos", () => {
    const grid = build(lines, COMPANY);
    expect(kinds(grid).slice(0, 6)).toEqual([
      "company",
      "letterhead",
      "letterhead",
      "letterhead",
      "labels",
      "labels",
    ]);
    expect(at(grid.rows[0], "B")).toBe("HOTEL DE PRUEBA");
    expect(at(grid.rows[1], "B")).toBe("DELICMAR S.A.S. · RUC 1891234567001");
    expect(at(grid.rows[2], "B")).toBe(
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
    );
    expect(at(grid.rows[3], "B")).toBe("0991045439 - 0958780660");
  });

  // The period shares a row with the first row of labels and the reader looks for it BY ITS SHAPE
  // among the rows above: no line of the letterhead can look like a period.
  it("el período sigue estando, y ninguna línea del membrete puede confundirse con él", () => {
    const grid = build(lines, COMPANY);
    expect(at(grid.rows[4], "B")).toBe("MARZO 2026");
    for (const row of grid.rows.filter((r) => r.kind === "letterhead")) {
      expect(at(row, "B")).not.toBe("MARZO 2026");
    }
  });

  it("sin perfil el preámbulo no gana ninguna fila", () => {
    expect(kinds(build(lines)).slice(0, 3)).toEqual(["company", "labels", "labels"]);
    expect(build(lines).rows.some((row) => row.kind === "letterhead")).toBe(false);
  });

  // What the accountant checks is each column's LETTER: the letterhead can only push the body
  // downwards, never move it sideways.
  it("el cuerpo no se mueve de columna, y `SUMAN` dice lo mismo con membrete y sin él", () => {
    const conMembrete = build(lines, COMPANY);
    const sinMembrete = build(lines);
    const suman = (grid: RolExportGrid) => grid.rows.find((row) => row.kind === "suman");

    expect(suman(conMembrete)?.cells).toEqual(suman(sinMembrete)?.cells);
    expect(
      conMembrete.rows.filter((row) => row.kind === "employee").map((row) => row.cells),
    ).toEqual(sinMembrete.rows.filter((row) => row.kind === "employee").map((row) => row.cells));
  });
});
