import { describe, expect, it } from "vitest";
import { is3DOption, type Chart3DOption, type ChartOption } from "@/lib/charts/types";
import { buildPersonnelCards, type PersonnelCardsInput } from "./cards";
import { readPersonnelCost } from "./derive";
import { goldenYear } from "./fixtures";

function labels(option: ChartOption | Chart3DOption | null) {
  if (!option) throw new Error("Falta la gráfica");
  if (is3DOption(option)) {
    return option.series
      .filter((series) => series.type === "bar3D")
      .map((series) => series.label?.show ?? false);
  }
  return option.series
    .filter((series) => series.type === "bar")
    .map((series) => series.label?.show ?? false);
}

describe("Cantidades siempre visibles", () => {
  for (const solid of [false, true]) {
    const input: PersonnelCardsInput = {
      reading: readPersonnelCost([goldenYear()], [0, 1]),
      groups: [],
      period: "Ene–Feb",
      evolutionView: solid ? "skyline" : "apilada",
      solidViews: { sections: solid ? "solido" : "plano" },
    };

    it(`3D=${solid}: muestra las cantidades automáticamente en ambas gráficas`, () => {
      const result = buildPersonnelCards(input);
      for (const card of ["sections", "groups"] as const) {
        expect(labels(result[card].option).every(Boolean)).toBe(true);
      }
    });

    it(`3D=${solid}: el filtro por grupo suspende las etiquetas y al quitarlo vuelven`, () => {
      const enabled = input;
      const filtered = buildPersonnelCards({ ...enabled, groups: ["afiliados"] });
      const restored = buildPersonnelCards(enabled);
      for (const card of ["sections", "groups"] as const) {
        expect(labels(filtered[card].option).some(Boolean)).toBe(false);
        expect(labels(restored[card].option).every(Boolean)).toBe(true);
      }
    });

    it(`3D=${solid}: filtrar por sección mantiene las cantidades`, () => {
      const result = buildPersonnelCards({
        ...input,
        groups: ["afiliados", "no-afiliados"],
        sections: ["planta"],
      });
      expect(labels(result.sections.option).every(Boolean)).toBe(true);
      expect(labels(result.groups.option).every(Boolean)).toBe(true);
    });
  }
});
