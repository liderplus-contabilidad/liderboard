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

  // MORALES MENA SILVIA JIMENA's real case in the March 2026 rol: `FR=N` with `AC FR=S`. `FR` leads
  // —both branches of §7 start by asking about it— so accruing with no entitlement is «not entitled»,
  // not a fourth mode.
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
  // It fixes the reason why the screen CANNOT rewrite the flags on opening a record: coming back from
  // the mode would lose the `AC FR=S` the accountant's file brings on MORALES, and rewriting it would
  // be inventing a correction nobody asked for. Only a deliberate change of mode can touch them.
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
