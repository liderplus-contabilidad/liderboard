import { describe, expect, it } from "vitest";
import { compareAccountCodes, mergeMonthSlice, sortAccountCodes } from "./merge-month";
import type { StagedUpload } from "./upload/types";
import type { PygDataset } from "./types";

type MonthSlice = Extract<StagedUpload, { kind: "month-slice" }>;
type AccountInput = { code: string; name: string; value: number };

function slice(
  month: number,
  centers: { name: string; accounts: AccountInput[] }[],
  general: AccountInput[],
  year = 2026,
): MonthSlice {
  return {
    kind: "month-slice",
    year,
    month,
    companyName: "HOTELERA ANDES S.A.",
    centers: centers.map((c) => ({
      name: c.name,
      accounts: c.accounts.map((a) => ({ code: a.code, name: a.name, values: [a.value] })),
    })),
    general: general.map((a) => ({ code: a.code, name: a.name, values: [a.value] })),
    warnings: [],
  };
}

function center(
  centerId: string,
  order: number,
  accounts: { code: string; value: number }[],
): PygDataset {
  const values = Array.from({ length: 12 }, () => 0);
  return {
    id: `ds-${centerId}`,
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "center",
    centerId,
    centerColor: "#000",
    order,
    costCenterName: centerId,
    accounts: accounts.map((a) => ({
      code: a.code,
      name: a.code,
      values: values.map((_, i) => (i === 0 ? a.value : 0)),
    })),
    resultFromFile: [],
    warnings: [],
  };
}

describe("mergeMonthSlice — escritura de una sola columna", () => {
  it("agrega un mes nuevo sin tocar los anteriores", () => {
    const enero = center("sucursal-norte", 0, [{ code: "4", value: 100 }]);
    const junio = slice(
      5,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 400 }] }],
      [{ code: "4", name: "Ingresos", value: 400 }],
    );
    const { datasets } = mergeMonthSlice([enero], [0], junio);
    const norte = datasets.find((d) => d.centerId === "sucursal-norte");
    expect(norte?.accounts.find((a) => a.code === "4")?.values).toEqual([
      100, 0, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("recargar el mismo mes sobrescribe solo ese índice", () => {
    const marzo = center("sucursal-norte", 0, [{ code: "4", value: 999 }]);
    // marzo.accounts values only set index 0 by the `center()` helper — move it to index 2.
    marzo.accounts[0].values = [0, 0, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const reload = slice(
      2,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 150 }] }],
      [{ code: "4", name: "Ingresos", value: 150 }],
    );
    const { datasets } = mergeMonthSlice([marzo], [2], reload);
    const norte = datasets.find((d) => d.centerId === "sucursal-norte");
    expect(norte?.accounts.find((a) => a.code === "4")?.values[2]).toBe(150);
  });
});

describe("mergeMonthSlice — identidad y alta de centro", () => {
  it("un centro nuevo se da de alta con doce ceros y color/orden de paleta", () => {
    const norte = center("sucursal-norte", 0, [{ code: "4", value: 300 }]);
    const junio = slice(
      5,
      [
        { name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 340 }] },
        { name: "SUCURSAL SUR", accounts: [{ code: "4", name: "Ingresos", value: 50 }] },
      ],
      [{ code: "4", name: "Ingresos", value: 390 }],
    );
    const { datasets } = mergeMonthSlice([norte], [0], junio);
    const sur = datasets.find((d) => d.centerId === "sucursal-sur");
    expect(sur).toBeTruthy();
    expect(sur?.order).toBe(1);
    expect(sur?.centerColor).toBeTruthy();
    expect(sur?.accounts.find((a) => a.code === "4")?.values).toEqual([
      0, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("un centro que desaparece del archivo conserva sus valores y recibe cero en el mes", () => {
    const norte = center("sucursal-norte", 0, [{ code: "4", value: 300 }]);
    const sur = center("sucursal-sur", 1, [{ code: "4", value: 50 }]);
    const junio = slice(
      5,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 340 }] }],
      [{ code: "4", name: "Ingresos", value: 340 }],
    );
    const { datasets } = mergeMonthSlice([norte, sur], [0], junio);
    const surAfter = datasets.find((d) => d.centerId === "sucursal-sur");
    expect(surAfter?.accounts.find((a) => a.code === "4")?.values).toEqual([
      50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    // still present in the selector
    expect(datasets.map((d) => d.centerId)).toContain("sucursal-sur");
  });
});

describe("mergeMonthSlice — identidad, orden y alta de cuenta", () => {
  it("una cuenta nueva se inserta en todos los centros con cero en meses anteriores", () => {
    const norte = center("sucursal-norte", 0, [{ code: "5.2.1.2.14", value: 10 }]);
    const junio = slice(
      5,
      [
        {
          name: "SUCURSAL NORTE",
          accounts: [
            { code: "5.2.1.2.14", name: "A", value: 20 },
            { code: "5.2.1.2.14.1", name: "B", value: 5 },
          ],
        },
      ],
      [
        { code: "5.2.1.2.14", name: "A", value: 20 },
        { code: "5.2.1.2.14.1", name: "B", value: 5 },
      ],
    );
    const { datasets } = mergeMonthSlice([norte], [0], junio);
    const accounts = datasets.find((d) => d.centerId === "sucursal-norte")?.accounts ?? [];
    const newAccount = accounts.find((a) => a.code === "5.2.1.2.14.1");
    expect(newAccount?.values).toEqual([0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0]);
    // positioned right after 5.2.1.2.14
    const codes = accounts.map((a) => a.code);
    expect(codes.indexOf("5.2.1.2.14.1")).toBe(codes.indexOf("5.2.1.2.14") + 1);
  });

  it("una cuenta ausente del archivo del mes recibe cero y conserva sus valores anteriores", () => {
    const norte = center("sucursal-norte", 0, [{ code: "4", value: 300 }]);
    norte.accounts.push({
      code: "4.1",
      name: "Ventas",
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    norte.accounts[1].values[0] = 300;
    const junio = slice(
      5,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 340 }] }],
      [{ code: "4", name: "Ingresos", value: 340 }],
    );
    const { datasets } = mergeMonthSlice([norte], [0], junio);
    const ventas = datasets
      .find((d) => d.centerId === "sucursal-norte")
      ?.accounts.find((a) => a.code === "4.1");
    expect(ventas?.values).toEqual([300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("compareAccountCodes / sortAccountCodes", () => {
  it("orders numerically by segment, not lexicographically", () => {
    expect(sortAccountCodes(["4.1.11", "4.1.7", "4.1.2"])).toEqual(["4.1.2", "4.1.7", "4.1.11"]);
    expect(compareAccountCodes("4.1.7", "4.1.11")).toBeLessThan(0);
  });
});

describe("mergeMonthSlice — cuadre contra GENERAL", () => {
  it("no avisa cuando el mes cuadra", () => {
    const norte = center("sucursal-norte", 0, []);
    const junio = slice(
      5,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 100 }] }],
      [{ code: "4", name: "Ingresos", value: 100 }],
    );
    const { warnings } = mergeMonthSlice([norte], [], junio);
    expect(warnings).toEqual([]);
  });

  it("avisa una vez por mes con el número de cuentas que no cuadran", () => {
    const norte = center("sucursal-norte", 0, []);
    const junio = slice(
      5,
      [{ name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", value: 100 }] }],
      [{ code: "4", name: "Ingresos", value: 999 }], // GENERAL disagrees
    );
    const { warnings } = mergeMonthSlice([norte], [], junio);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1 cuenta");
    expect(warnings[0]).toContain("no cuadra");
  });
});

describe("mergeMonthSlice — aviso de archivo acumulado", () => {
  function pairSlice(month: number, ups: number, downs: number, base: number): MonthSlice {
    const accounts: AccountInput[] = [];
    for (let i = 0; i < ups; i++) {
      accounts.push({ code: `4.${i}`, name: `Cuenta ${i}`, value: base + 100 });
    }
    for (let i = 0; i < downs; i++) {
      accounts.push({ code: `5.${i}`, name: `Cuenta ${i}`, value: base - 100 });
    }
    return slice(month, [{ name: "SUCURSAL NORTE", accounts }], accounts);
  }

  /** Places every value at index 4 (mayo) — the month-1 the June (index 5) comparison reads. */
  function previousCenter(ups: number, downs: number, base: number): PygDataset {
    const dataset = center("sucursal-norte", 0, []);
    const codes = [
      ...Array.from({ length: ups }, (_, i) => `4.${i}`),
      ...Array.from({ length: downs }, (_, i) => `5.${i}`),
    ];
    dataset.accounts = codes.map((code) => ({
      code,
      name: code,
      values: [0, 0, 0, 0, base, 0, 0, 0, 0, 0, 0, 0],
    }));
    return dataset;
  }

  it("avisa cuando la firma de acumulado se cumple (≥20 subidas, ≤5% bajadas)", () => {
    const prev = previousCenter(24, 1, 100); // 24 up, 1 down → 4% down share
    const junio = pairSlice(5, 24, 1, 100);
    const { warnings } = mergeMonthSlice([prev], [4], junio);
    expect(warnings.some((w) => w.includes("acumulado"))).toBe(true);
    expect(warnings.some((w) => w.includes("24 de 25"))).toBe(true);
  });

  it("un mes normal (subidas y bajadas comparables) no dispara el aviso", () => {
    const prev = previousCenter(12, 12, 100);
    const junio = pairSlice(5, 12, 12, 100);
    const { warnings } = mergeMonthSlice([prev], [4], junio);
    expect(warnings.some((w) => w.includes("acumulado"))).toBe(false);
  });

  it("sin mes anterior cargado, la comprobación se omite", () => {
    const prev = previousCenter(24, 1, 100);
    const junio = pairSlice(5, 24, 1, 100);
    // month 4 (mayo) is NOT in loadedMonths — nothing to compare against.
    const { warnings } = mergeMonthSlice([prev], [], junio);
    expect(warnings.some((w) => w.includes("acumulado"))).toBe(false);
  });
});

describe("un workspace segmentado sobrevive a cargar un mes", () => {
  // The non-operating block lives only in the stored dataset — no file ever brings a root 6 —
  // so a month merge that rebuilt accounts from the slice alone would silently erase it.
  const segmented = center("norte", 0, [
    { code: "5.2.1", value: 100 },
    { code: "6.1", value: 40 },
  ]);
  const febrero = slice(
    1,
    [{ name: "NORTE", accounts: [{ code: "5.2.1", name: "Servicios", value: 70 }] }],
    [{ code: "5.2.1", name: "Servicios", value: 70 }],
  );

  it("conserva las cuentas de la sección 6 y su clasificación anterior", () => {
    const { datasets } = mergeMonthSlice([segmented], [0], febrero);
    const byCode = new Map(datasets[0].accounts.map((a) => [a.code, a.values]));

    expect(byCode.get("6.1")?.[0]).toBe(40);
  });

  it("entra el mes nuevo sin clasificar: la 6 en 0 y la 5.2 con lo que trae el archivo", () => {
    const { datasets } = mergeMonthSlice([segmented], [0], febrero);
    const byCode = new Map(datasets[0].accounts.map((a) => [a.code, a.values]));

    expect(byCode.get("6.1")?.[1]).toBe(0);
    expect(byCode.get("5.2.1")?.[1]).toBe(70);
  });
});
