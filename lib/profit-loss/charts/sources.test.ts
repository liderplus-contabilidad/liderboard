import { describe, expect, it } from "vitest";
import { makeDataset } from "../analytics/fixtures";
import { applyEditsToLeafAccounts, mergeCenters } from "../derive";
import type { CellEdit, PygDataset } from "../types";
import { sourcesFromViews, type AnalyticsView } from "./sources";

const HABITACIONES = "4.1.1.1.1.1";

const MANOR = makeDataset();
const PRINCIPAL = makeDataset({
  centerId: "centro-de-costo-principal",
  centerName: "Centro de Costo Principal",
  scale: 0.01,
});

/**
 * The same views `PygDataProvider.buildViews` produces for a two-center workspace: the
 * synthetic Consolidado first (edits already merged into its accounts), then each center.
 */
function workspaceViews(edits: CellEdit[] = []): AnalyticsView[] {
  const centers = [MANOR, PRINCIPAL];
  const merged = mergeCenters(
    centers.map((center) =>
      applyEditsToLeafAccounts(
        center.accounts,
        edits.filter((edit) => edit.datasetId === center.id),
      ),
    ),
  );
  const consolidado: PygDataset = {
    ...MANOR,
    id: "consolidado",
    centerId: "consolidado",
    costCenterName: undefined,
    accounts: merged.accounts,
  };

  return [
    { id: "consolidado", name: "Consolidado", dataset: consolidado },
    { id: "cultura-manor", name: "Cultura Manor", dataset: MANOR },
    { id: "centro-de-costo-principal", name: "Centro de Costo Principal", dataset: PRINCIPAL },
  ];
}

function january(source: { valuesByCode: Map<string, number[]> }, code: string): number {
  return source.valuesByCode.get(code)?.[0] ?? Number.NaN;
}

describe("fuentes analíticas desde las vistas del workspace", () => {
  it("makes the Consolidado one more source, queryable like any other", () => {
    const sources = sourcesFromViews(workspaceViews(), []);
    const consolidado = sources.find((source) => source.centerId === "consolidado");

    expect(consolidado).toBeDefined();
    expect(consolidado?.centerName).toBe("Consolidado");
    // 17338 + 173,38 — the column-wise sum of the two centers, not a special case.
    expect(january(consolidado as never, HABITACIONES)).toBeCloseTo(17338 + 173.38, 5);
    expect(sources.map((source) => source.centerId)).toEqual([
      "consolidado",
      "cultura-manor",
      "centro-de-costo-principal",
    ]);
  });

  it("keeps a standalone statement on the identity of its view, not on `default`", () => {
    const single: PygDataset = {
      ...makeDataset(),
      id: "statement-2026",
      role: "single",
      centerId: undefined,
      costCenterName: undefined,
    };
    const [source] = sourcesFromViews(
      [{ id: single.id, name: single.companyName, dataset: single }],
      [],
    );

    expect(source.centerId).toBe("statement-2026");
    expect(source.centerId).not.toBe("default");
    expect(source.centerName).toBe("NOMIK HOTELES S.A.S.");
  });

  it("does not let an edit of one center reach another", () => {
    const edit: CellEdit = {
      datasetId: MANOR.id,
      code: HABITACIONES,
      monthIndex: 0,
      value: 99_000,
      updatedAt: 0,
    };
    const sources = sourcesFromViews(workspaceViews([edit]), [edit]);
    const manor = sources.find((source) => source.centerId === "cultura-manor");
    const principal = sources.find((source) => source.centerId === "centro-de-costo-principal");

    expect(january(manor as never, HABITACIONES)).toBe(99_000);
    expect(january(principal as never, HABITACIONES)).toBeCloseTo(173.38, 5);
  });

  it("returns nothing for an empty workspace instead of failing a query", () => {
    expect(sourcesFromViews([], [])).toEqual([]);
  });

  it("passes the same declared coverage to every view, Consolidado included", () => {
    const covered = new Set([0, 1]);
    const sources = sourcesFromViews(workspaceViews(), [], covered);
    for (const source of sources) {
      expect([...source.coverage]).toEqual([0, 1]);
    }
  });
});
