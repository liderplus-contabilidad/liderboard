import { describe, expect, it } from "vitest";
import {
  BUSINESS_LINES_PRESET,
  EXPENSE_DISTRIBUTION_PRESET,
  PRESET_VIEWS,
  findPreset,
  presetEffects,
  type PresetView,
} from "./preset-views";

const view = (overrides: Partial<PresetView>): PresetView => ({
  id: "prueba",
  label: "Prueba",
  description: "Una vista de prueba",
  isAvailable: () => true,
  ...overrides,
});

describe("presetEffects", () => {
  it("nombra las dos siembras de «Ventas», que es lo que marca al encenderse", () => {
    const ventas = findPreset(BUSINESS_LINES_PRESET);
    expect(ventas && presetEffects(ventas)).toEqual([
      "Marca los centros",
      "Marca los meses cargados",
    ]);
  });

  it("nombra la frecuencia y el acotado del anexo de gastos, que no siembra nada", () => {
    const anexo = findPreset(EXPENSE_DISTRIBUTION_PRESET);
    expect(anexo && presetEffects(anexo)).toEqual(["Se lee en anual", "Se acota marcando cuentas"]);
  });

  // La tarjeta pinta esta lista tal cual: una vista que no declara nada tiene que dejarla vacía
  // en vez de inventarse una frase, o la tira de chips prometería un efecto que no ocurre.
  it("devuelve [] cuando la vista no declara ningún efecto", () => {
    expect(presetEffects(view({}))).toEqual([]);
  });

  it("dice la frecuencia con el rótulo del vocabulario compartido, no con su id", () => {
    expect(presetEffects(view({ frequency: "trimestral" }))).toEqual(["Se lee en trimestral"]);
  });

  // El orden es el del gesto: primero lo que la vista hace por su cuenta, después cómo se lee.
  it("pone las siembras antes que la frecuencia y el acotado", () => {
    expect(
      presetEffects(
        view({
          seeds: { centers: true, periods: true },
          frequency: "anual",
          narrowedByCodes: true,
        }),
      ),
    ).toEqual([
      "Marca los centros",
      "Marca los meses cargados",
      "Se lee en anual",
      "Se acota marcando cuentas",
    ]);
  });

  it("omite la siembra que la vista declara apagada", () => {
    expect(presetEffects(view({ seeds: { centers: true, periods: false } }))).toEqual([
      "Marca los centros",
    ]);
  });
});

describe("PRESET_VIEWS", () => {
  // El modal escribe las dos: el rótulo en la tarjeta y la descripción bajo él, donde antes solo
  // vivía en un `title=` que nadie veía.
  it("cada vista trae rótulo y descripción, que es lo que la tarjeta imprime", () => {
    for (const preset of PRESET_VIEWS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});
