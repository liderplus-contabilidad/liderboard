import { describe, expect, it } from "vitest";
import { fitBarWidth, GROUPED_BAR_GAP } from "./bar-fit";

/**
 * The rule is arithmetic, so what these check is the arithmetic's SHAPE — that width follows the room
 * a column has — and the two ends where it stops following it. Fixing exact pixels here would be
 * writing the four hand-picked numbers this file exists to replace, one directory over.
 */
describe("fitBarWidth", () => {
  it("cuantas menos columnas, más ancha la barra", () => {
    const widths = [2, 4, 6, 12, 24].map((columns) => fitBarWidth(columns));

    for (let index = 1; index < widths.length; index += 1) {
      expect(widths[index]).toBeLessThanOrEqual(widths[index - 1]);
    }
    expect(widths.at(-1)).toBeLessThan(widths[0]);
  });

  it("las barras que comparten columna se reparten su banda, nunca la repiten", () => {
    // Doce columnas: ahí ninguna llega al techo, así que lo que se ve es el reparto y no el tope.
    const sola = fitBarWidth(12);
    const pareja = fitBarWidth(12, 2);
    const cinco = fitBarWidth(12, 5);

    expect(pareja).toBeLessThan(sola);
    expect(cinco).toBeLessThan(pareja);
    // Y el grupo entero sigue cabiendo en la banda que le tocaba: dos barras y su hueco no ocupan
    // más de lo que ocupaba una sola.
    expect(pareja * 2 + pareja * 0.3).toBeLessThanOrEqual(sola + 1);
  });

  it("con dos columnas no devuelve media pantalla de relleno", () => {
    // La aritmética sola daría un tercio del gráfico por barra, y lo que se lee entonces es el hueco
    // entre dos losas y no la altura de dos marcas.
    expect(fitBarWidth(1)).toBe(fitBarWidth(2));
    expect(fitBarWidth(1)).toBeLessThanOrEqual(88);
  });

  it("con muchísimas columnas la barra se queda en un hilo, pero no desaparece", () => {
    expect(fitBarWidth(200, 4)).toBeGreaterThan(0);
    expect(fitBarWidth(200, 4)).toBeLessThan(10);
  });

  it("el hueco entre barras viaja con la regla, porque es parte de la misma cuenta", () => {
    expect(GROUPED_BAR_GAP).toBe("30%");
  });
});
