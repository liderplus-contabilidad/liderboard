import { describe, expect, it } from "vitest";
import type { PersonnelGroupId, PersonnelSectionId } from "./accounts";
import { buildPersonnelCards } from "./cards";
import { readPersonnelCost, scopePersonnelCost } from "./derive";
import { goldenYear, legacyYear } from "./fixtures";
import { buildPersonnelGrid } from "./grid";
import { legacyRowsInGroups } from "./legacy";
import { formatCurrency } from "@/lib/format";

describe("Filtros de la clasificación histórica", () => {
  const reading = readPersonnelCost([legacyYear()], [0, 1]);
  const cases: {
    groups: PersonnelGroupId[];
    sections?: PersonnelSectionId[];
    ids: string[];
    total: number;
  }[] = [
    { groups: ["afiliados"], ids: ["afiliado-personal", "afiliado-familia"], total: 2600 },
    { groups: ["no-afiliados"], ids: ["factura-familia", "externos"], total: 2250 },
    { groups: ["honorarios-medicos"], ids: ["factura-familia", "externos"], total: 2250 },
    {
      groups: ["no-afiliados", "honorarios-medicos"],
      ids: ["factura-familia", "externos"],
      total: 2250,
    },
    {
      groups: ["afiliados", "no-afiliados"],
      sections: ["planta"],
      ids: ["afiliado-personal", "afiliado-familia"],
      total: 2600,
    },
    {
      groups: ["honorarios-medicos"],
      sections: ["externos"],
      ids: ["factura-familia", "externos"],
      total: 2250,
    },
    {
      groups: ["afiliados", "no-afiliados"],
      ids: ["afiliado-personal", "afiliado-familia", "factura-familia", "externos"],
      total: 4850,
    },
  ];

  it.each(cases)("grupos $groups / secciones $sections", ({ groups, sections, ids, total }) => {
    expect(legacyRowsInGroups(groups, sections).map((row) => row.id)).toEqual(ids);
    const scoped = scopePersonnelCost(reading, groups, sections);
    expect(scoped.total).toBe(total);
    expect(scoped.revenue).toBe(22000);
    expect(scoped.share).toBeCloseTo((total / 22000) * 100);
    expect(scoped.years[0].monthly[2]).toBeNull();
    expect(scopePersonnelCost(scoped, groups, sections)).toEqual(scoped);

    const grid = buildPersonnelGrid(reading, { groups, sections, hideEmptyRows: false });
    expect(grid.rows.filter((row) => row.key.startsWith("legacy:")).map((row) => row.key)).toEqual(
      ids.map((id) => `legacy:${id}`),
    );
    expect(
      grid.rows.find((row) => row.key === "grand")?.cells.find((cell) => cell.kind === "total")
        ?.value,
    ).toBe(total);

    const cards = buildPersonnelCards({ reading, groups, sections, period: "Ene–Feb 2019" });
    const names = cards.sections.option?.series.map((series) => series.name);
    expect(names).toEqual([...scoped.sections.map((entry) => entry.section.label), "Total"]);
  });

  it("compara formatos sin duplicar los históricos ni cambiar los grupos modernos", () => {
    const modern = readPersonnelCost([goldenYear()], [0, 1]);
    const mixed = readPersonnelCost([legacyYear(), goldenYear()], [0, 1]);
    const groups: PersonnelGroupId[] = ["no-afiliados", "honorarios-medicos"];
    expect(scopePersonnelCost(mixed, groups).total).toBeCloseTo(
      scopePersonnelCost(modern, groups).total + 2250,
    );
    const planta = scopePersonnelCost(mixed, ["afiliados", "no-afiliados"], ["planta"]);
    expect(planta.total).toBeCloseTo(
      modern.sections.find((entry) => entry.section.id === "planta")!.total + 2600,
    );
  });

  for (const solid of [false, true]) {
    for (const mixed of [false, true]) {
      it.each(cases)(
        `todas las gráficas: 3D=${solid}, comparación=${mixed}, $groups / $sections`,
        ({ groups, sections }) => {
          const source = readPersonnelCost(
            mixed ? [legacyYear(), goldenYear()] : [legacyYear()],
            [0, 1],
          );
          const scoped = scopePersonnelCost(source, groups, sections);
          const input = {
            reading: source,
            groups,
            sections,
            period: "Ene–Feb",
            evolutionView: solid ? ("skyline" as const) : ("apilada" as const),
            solidViews: {
              sections: solid ? ("solido" as const) : ("plano" as const),
              shares: solid ? ("solido" as const) : ("plano" as const),
            },
          };
          const cards = buildPersonnelCards(input);
          const money = (value: number) => formatCurrency(value, { cents: true });
          const historic = scoped.years[0];
          expect(cards.shares.option).not.toBeNull();
          expect(cards.sharesEntries.map((entry) => entry.id)).toEqual(
            scoped.sections.map((entry) => entry.section.id),
          );
          expect(cards.shares.table.rows.find((row) => row.id === "parent")?.values[0]).toBe(
            money(historic.total),
          );
          expect(
            cards.groups.table.rows[0].values[mixed ? 0 : cards.groups.table.columns.length - 1],
          ).toBe(money(historic.monthly[0]!));
          expect(cards.sections.table.rows[0].values.at(-1)).toBe(
            money(mixed ? historic.total : historic.monthly[0]!),
          );

          for (const entry of cards.sharesEntries) {
            const detail = buildPersonnelCards({ ...input, sharesPath: entry.next! });
            const expected = historic.legacyRows.filter((row) => row.row.section === entry.id);
            expect(
              detail.shares.table.rows
                .filter((row) => row.id?.startsWith("legacy:"))
                .map((row) => row.id),
            ).toEqual(expected.map((row) => `legacy:${row.row.id}`));
            if (expected.length > 0) {
              expect(detail.shares.table.rows.find((row) => row.id === "parent")?.values[0]).toBe(
                money(expected.reduce((sum, row) => sum + row.total, 0)),
              );
            }
          }
        },
      );
    }
  }

  it("sin ventas no inventa porcentajes históricos", () => {
    const input = legacyYear();
    const cards = buildPersonnelCards({
      reading: readPersonnelCost([{ ...input, revenue: Array(12).fill(0) }], [0, 1]),
      groups: ["no-afiliados"],
      period: "Ene–Feb",
    });
    expect(cards.shares.option).toBeNull();
    expect(cards.shares.note).toContain("sin ventas");
    expect(cards.shares.table.rows.find((row) => row.id === "externos")?.values).toEqual([
      "$2,250.00",
      null,
    ]);
  });
});
