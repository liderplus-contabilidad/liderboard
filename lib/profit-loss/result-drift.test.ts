import { describe, expect, it } from "vitest";
import type { YearSlice } from "./derive";
import { computeResultDrift, describeResultDrift, type ResultDrift } from "./result-drift";
import { twinWriteFor } from "./segment";
import type { AccountRow, CellEdit, PygDataset } from "./types";

/** Three columns is enough to tell "the period that moved" from the ones that did not. */
const WIDTH = 3;

function row(code: string, ...values: number[]): AccountRow {
  return { code, name: code, values: [...values, ...Array(WIDTH - values.length).fill(0)] };
}

/** Ingresos 1,000 / Gastos 400 in the first column → utilidad 600. */
const ACCOUNTS: AccountRow[] = [
  row("4", 1000, 500),
  row("4.1", 1000, 500),
  row("5", 400, 200),
  row("5.1", 400, 200),
];

function dataset(year: number, accounts: AccountRow[] = ACCOUNTS): PygDataset {
  return {
    id: `d${year}`,
    clientId: "c1",
    fileName: "reporte.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic",
    year,
    baseFrequency: "mensual",
    role: "single",
    accounts,
    resultFromFile: [],
    warnings: [],
  };
}

function edit(code: string, monthIndex: number, value: number | null): CellEdit {
  return { datasetId: "d1", code, monthIndex, value, updatedAt: 0 };
}

function slice(edits: CellEdit[], year = 2026, accounts?: AccountRow[]): YearSlice {
  return { dataset: dataset(year, accounts), edits };
}

describe("computeResultDrift", () => {
  it("says nothing when there are no adjustments", () => {
    expect(computeResultDrift([slice([])])).toBeNull();
  });

  it("says nothing when the only edits are comments", () => {
    const comment: CellEdit = {
      datasetId: "d1",
      code: "4.1",
      monthIndex: 0,
      comment: "ojo",
      updatedAt: 0,
    };
    expect(computeResultDrift([slice([comment])])).toBeNull();
  });

  it("reports the period an income adjustment moved, and only that one", () => {
    const drift = computeResultDrift([slice([edit("4.1", 0, 1500)])]);
    expect(drift?.periods).toHaveLength(1);
    expect(drift?.periods[0]).toMatchObject({
      year: 2026,
      index: 0,
      label: "Ene 2026",
      file: 600,
      current: 1100,
      difference: 500,
    });
    expect(drift?.total).toBe(500);
  });

  it("moves the result the other way for an expense adjustment", () => {
    const drift = computeResultDrift([slice([edit("5.1", 0, 900)])]);
    expect(drift?.periods[0]).toMatchObject({ file: 600, current: 100, difference: -500 });
  });

  it("reads a cleared cell as a zero", () => {
    const drift = computeResultDrift([slice([edit("4.1", 0, null)])]);
    expect(drift?.periods[0]).toMatchObject({ file: 600, current: -400, difference: -1000 });
  });

  it("lists several periods and years in calendar order, with the signed total", () => {
    const drift = computeResultDrift([
      slice([edit("4.1", 1, 800)], 2026),
      slice([edit("5.1", 0, 500)], 2025),
    ]);
    expect(drift?.periods.map((period) => period.label)).toEqual(["Ene 2025", "Feb 2026"]);
    // 2025: −100 (gasto arriba) · 2026: +500 en el segundo periodo (500 − 200 = 300 → 800 − 200)
    expect(drift?.periods.map((period) => period.difference)).toEqual([-100, 300]);
    expect(drift?.total).toBe(200);
  });

  it("ignores a difference under half a cent", () => {
    expect(computeResultDrift([slice([edit("4.1", 0, 1000.004)])])).toBeNull();
  });

  it("says nothing when the adjustment restores the file's own value", () => {
    // `storedAdjustment` keeps such an edit from ever being written; if one exists anyway,
    // the difference is zero and there is nothing to report.
    expect(computeResultDrift([slice([edit("4.1", 0, 1000)])])).toBeNull();
  });
});

describe("describeResultDrift", () => {
  /** Unwraps a drift the test knows is there. */
  function driftOf(edits: CellEdit[]): ResultDrift {
    const drift = computeResultDrift([slice(edits)]);
    if (!drift) {
      throw new Error("se esperaba un descuadre");
    }
    return drift;
  }

  it("says it all on one line for a single period, with no detail to open", () => {
    const { summary, details } = describeResultDrift(driftOf([edit("4.1", 0, 1500)]));
    expect(summary).toBe(
      "La utilidad de Ene 2026 ya no coincide con la del archivo: traía $600.00 y ahora da $1,100.00 (+$500.00).",
    );
    expect(details).toEqual([]);
  });

  it("counts the periods and totals them, one detail line each", () => {
    const { summary, details } = describeResultDrift(
      driftOf([edit("4.1", 0, 1500), edit("5.1", 1, 900)]),
    );
    expect(summary).toBe(
      "La utilidad ya no coincide con la del archivo en 2 periodos: -$200.00 en total.",
    );
    expect(details).toEqual([
      "Ene 2026: el archivo trae $600.00, ahora da $1,100.00 (+$500.00).",
      "Feb 2026: el archivo trae $300.00, ahora da -$400.00 (-$700.00).",
    ]);
  });
});

describe("computeResultDrift — reclassifying is not a descuadre", () => {
  /** A segmented statement: root 6 mirrors the 5.2 subtree, zeroed, as `segmentWorkspace` leaves it. */
  const SEGMENTED: AccountRow[] = [
    row("4", 1000),
    row("4.1", 1000),
    row("5", 400),
    row("5.2", 400),
    row("5.2.1", 400),
    row("6", 0),
    row("6.1", 0),
  ];

  it("keeps the exercise still when a non-operating write pairs with its twin", () => {
    const edits: CellEdit[] = [];
    const value = 150;
    // What `segment-actions` writes: the non-operating cell plus the twin discounted by difference.
    const twin = twinWriteFor(SEGMENTED, edits, "6.1", 0, value);
    expect(twin).toMatchObject({ code: "5.2.1", value: 250 });
    edits.push(edit("6.1", 0, value), edit(twin?.code ?? "", 0, twin?.value ?? 0));

    // 5 gives up exactly what 6 takes, and both subtract — the utilidad cannot move.
    expect(computeResultDrift([slice(edits, 2026, SEGMENTED)])).toBeNull();
  });

  it("does report the drift when only the non-operating side is written", () => {
    const drift = computeResultDrift([slice([edit("6.1", 0, 150)], 2026, SEGMENTED)]);
    expect(drift?.periods[0]).toMatchObject({ file: 600, current: 450, difference: -150 });
  });
});
