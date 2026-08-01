import { describe, expect, it } from "vitest";
import { emptyDataset } from "./derive";
import {
  deriveHotelIdentity,
  describeHotelChange,
  sameHotelIdentity,
  type HotelChangeContext,
} from "./hotel-identity";

function dataset(hotelName: string, year = 2026) {
  return emptyDataset(year, hotelName);
}

function context(overrides: Partial<HotelChangeContext> = {}): HotelChangeContext {
  return {
    activeHotelName: "Manor Galápagos",
    matchingHotelName: null,
    proposedHotelName: "Hotel Ambato",
    activeHotelContents: "2 sucursales, 2025–2026",
    incomingContents: "sucursal Centro, 2026",
    ...overrides,
  };
}

describe("deriveHotelIdentity", () => {
  it("un hotel sin datos no tiene identidad: adopta, no choca", () => {
    expect(deriveHotelIdentity([])).toBeNull();
  });

  it("adopta el nombre que declaran sus datos, verbatim", () => {
    expect(deriveHotelIdentity([dataset("HOTEL AMBATO")])).toEqual({ hotelName: "HOTEL AMBATO" });
  });

  it("ignora un dataset sin nombre de hotel en vez de identificarse con el vacío", () => {
    expect(deriveHotelIdentity([dataset("  "), dataset("CULTURA MANOR")])).toEqual({
      hotelName: "CULTURA MANOR",
    });
    expect(deriveHotelIdentity([dataset("   ")])).toBeNull();
  });
});

describe("sameHotelIdentity", () => {
  it("ignora mayúsculas, acentos y espacios de sobra", () => {
    expect(sameHotelIdentity({ hotelName: "HOTEL AMBATO" }, { hotelName: "Hotel Ambato" })).toBe(
      true,
    );
    expect(sameHotelIdentity({ hotelName: "Cultura Manor" }, { hotelName: "CULTURA MÁNOR" })).toBe(
      true,
    );
    expect(sameHotelIdentity({ hotelName: "HOTEL  AMBATO " }, { hotelName: "Hotel Ambato" })).toBe(
      true,
    );
  });

  it("la puntuación separa, no desaparece: quitar el punto sí cambia la identidad", () => {
    expect(sameHotelIdentity({ hotelName: "Manor S.A." }, { hotelName: "Manor S. A." })).toBe(true);
    expect(sameHotelIdentity({ hotelName: "Manor S.A." }, { hotelName: "MANOR SA" })).toBe(false);
  });

  it("distingue dos hoteles distintos", () => {
    expect(sameHotelIdentity({ hotelName: "HOTEL AMBATO" }, { hotelName: "CULTURA MANOR" })).toBe(
      false,
    );
  });
});

describe("describeHotelChange", () => {
  const current = { hotelName: "CULTURA MANOR" };
  const incoming = { hotelName: "HOTEL AMBATO" };

  describe("cuando otro hotel ya tiene esa identidad", () => {
    const confirmation = describeHotelChange(
      current,
      incoming,
      context({ matchingHotelName: "Ambato Centro" }),
    );

    it("la acción principal es cargar allí, y no ofrece reemplazar", () => {
      expect(confirmation.form).toBe("other-hotel");
      expect(confirmation.primaryLabel).toBe("Cargar en Ambato Centro");
      expect(confirmation.replace).toBeUndefined();
    });

    it("dice que el hotel abierto queda intacto", () => {
      expect(confirmation.primaryHint).toContain("Manor Galápagos queda intacto");
    });

    it("nombra al hotel que sí coincide", () => {
      expect(confirmation.verdict).toContain("Ambato Centro");
    });
  });

  describe("cuando ningún hotel coincide", () => {
    const confirmation = describeHotelChange(current, incoming, context());

    it("la acción principal es crear el hotel propuesto", () => {
      expect(confirmation.form).toBe("no-match");
      expect(confirmation.primaryLabel).toBe("Crear hotel y cargar");
      expect(confirmation.verdict).toContain("«Hotel Ambato»");
    });

    it("reemplazar queda como salida secundaria, con su motivo y lo que descarta", () => {
      expect(confirmation.replace?.label).toBe("Reemplazar este hotel");
      expect(confirmation.replace?.description).toContain(
        "Si Manor Galápagos pasó a llamarse HOTEL AMBATO",
      );
      expect(confirmation.replace?.description).toContain("2 sucursales, 2025–2026");
      expect(confirmation.replace?.description).toContain("Los demás hoteles no se tocan");
    });
  });

  it("la tarjeta del hotel abierto repite el nombre declarado solo cuando difiere de la etiqueta", () => {
    const differs = describeHotelChange(current, incoming, context());
    expect(differs.cards.current.detail).toBe("CULTURA MANOR · 2 sucursales, 2025–2026");

    const same = describeHotelChange(
      current,
      incoming,
      context({ activeHotelName: "CULTURA MANOR" }),
    );
    expect(same.cards.current.detail).toBe("2 sucursales, 2025–2026");
  });

  it("la tarjeta de los archivos lleva el nombre declarado y lo que traen", () => {
    const confirmation = describeHotelChange(current, incoming, context());
    expect(confirmation.cards.incoming.name).toBe("HOTEL AMBATO");
    expect(confirmation.cards.incoming.detail).toBe("sucursal Centro, 2026");
  });
});
