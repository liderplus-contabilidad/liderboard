import { describe, expect, it } from "vitest";
import { RESERVE_FUND_OPTIONS, reserveFundFlags, reserveFundMode } from "./reserve-fund";

describe("reserveFundMode", () => {
  it("sin derecho no genera nada", () => {
    expect(reserveFundMode({ hasReserveFund: false, accumulatesReserveFund: false })).toBe(
      "sin-derecho",
    );
  });

  it("con derecho y sin acumular, lo cobra cada mes", () => {
    expect(reserveFundMode({ hasReserveFund: true, accumulatesReserveFund: false })).toBe(
      "mensual",
    );
  });

  it("con derecho y acumulando, va al costo patronal", () => {
    expect(reserveFundMode({ hasReserveFund: true, accumulatesReserveFund: true })).toBe("acumula");
  });

  // El caso real de MORALES MENA SILVIA JIMENA en el rol de marzo 2026: `FR=N` con `AC FR=S`.
  // `FR` manda —las dos ramas de §7 arrancan preguntando por él— así que acumular sin derecho es
  // «no le corresponde», no un cuarto modo.
  it("acumular sin derecho es sin derecho: FR manda sobre AC FR", () => {
    expect(reserveFundMode({ hasReserveFund: false, accumulatesReserveFund: true })).toBe(
      "sin-derecho",
    );
  });
});

describe("reserveFundFlags", () => {
  it("devuelve el par de banderas de cada modo", () => {
    expect(reserveFundFlags("sin-derecho")).toEqual({
      hasReserveFund: false,
      accumulatesReserveFund: false,
    });
    expect(reserveFundFlags("mensual")).toEqual({
      hasReserveFund: true,
      accumulatesReserveFund: false,
    });
    expect(reserveFundFlags("acumula")).toEqual({
      hasReserveFund: true,
      accumulatesReserveFund: true,
    });
  });
});

describe("la traducción es asimétrica", () => {
  // Fija la razón por la que la pantalla NO puede reescribir las banderas al abrir una ficha: la
  // vuelta desde el modo perdería el `AC FR=S` que el archivo del contador trae en MORALES, y
  // reescribirlo sería inventarse una corrección que nadie pidió. Solo un cambio deliberado de
  // modo puede tocarlas.
  it("(FR=N, AC FR=S) no sobrevive a la ida y vuelta", () => {
    const stored = { hasReserveFund: false, accumulatesReserveFund: true };
    expect(reserveFundFlags(reserveFundMode(stored))).not.toEqual(stored);
  });

  it("las otras tres combinaciones sí dan la vuelta completa", () => {
    for (const stored of [
      { hasReserveFund: false, accumulatesReserveFund: false },
      { hasReserveFund: true, accumulatesReserveFund: false },
      { hasReserveFund: true, accumulatesReserveFund: true },
    ]) {
      expect(reserveFundFlags(reserveFundMode(stored))).toEqual(stored);
    }
  });
});

describe("RESERVE_FUND_OPTIONS", () => {
  it("ofrece los tres modos, una vez cada uno", () => {
    expect(RESERVE_FUND_OPTIONS.map((option) => option.value)).toEqual([
      "sin-derecho",
      "mensual",
      "acumula",
    ]);
  });
});
