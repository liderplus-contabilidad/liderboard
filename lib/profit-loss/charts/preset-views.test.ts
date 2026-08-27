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

  // The card paints this list as it is: a view that declares nothing has to leave it empty instead of
  // inventing a phrase, or the chip strip would promise an effect that does not happen.
  it("devuelve [] cuando la vista no declara ningún efecto", () => {
    expect(presetEffects(view({}))).toEqual([]);
  });

  it("dice la frecuencia con el rótulo del vocabulario compartido, no con su id", () => {
    expect(presetEffects(view({ frequency: "trimestral" }))).toEqual(["Se lee en trimestral"]);
  });

  // The order is that of the gesture: first what the view does on its own, then how it is read.
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
  // The modal writes both: the label on the card and the description under it, where before it only
  // lived in a `title=` nobody saw.
  it("cada vista trae rótulo y descripción, que es lo que la tarjeta imprime", () => {
    for (const preset of PRESET_VIEWS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});
