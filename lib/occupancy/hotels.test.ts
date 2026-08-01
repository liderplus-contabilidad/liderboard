import { describe, expect, it } from "vitest";
import type { HotelIdentity } from "./hotel-identity";
import {
  findHotelByName,
  findHotelForIdentity,
  isHotelNameTaken,
  normalizeHotelName,
  proposeHotelName,
  type OccupancyHotel,
} from "./hotels";

function hotel(id: string, name: string): OccupancyHotel {
  return { id, name };
}

const hotels = [
  hotel("a", "Manor Galápagos"),
  hotel("b", "Ambato Centro"),
  hotel("c", "Recién creado"),
];

describe("normalizeHotelName", () => {
  it("nombra al hotel cuando falta el nombre", () => {
    const empty = normalizeHotelName("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.message).toBe("Escribe un nombre para el hotel.");
    }
  });

  it("recorta y acepta hasta 60 caracteres", () => {
    expect(normalizeHotelName("  Manor   Galápagos ")).toEqual({
      ok: true,
      name: "Manor Galápagos",
    });
    expect(normalizeHotelName("a".repeat(61)).ok).toBe(false);
  });
});

describe("isHotelNameTaken", () => {
  it("considera duplicado un nombre que solo cambia en mayúsculas y acentos", () => {
    expect(isHotelNameTaken("manor galapagos", hotels)).toBe(true);
    expect(findHotelByName("MANOR GALÁPAGOS", hotels)?.id).toBe("a");
  });

  it("renombrar no choca consigo mismo", () => {
    expect(isHotelNameTaken("Manor Galápagos", hotels, "a")).toBe(false);
  });
});

describe("proposeHotelName", () => {
  it("capitula el nombre gritado del archivo y desempata contra los que ya existen", () => {
    expect(proposeHotelName("HOTEL AMBATO", [])).toBe("Hotel Ambato");
    expect(proposeHotelName("AMBATO CENTRO", hotels)).toBe("Ambato Centro 2");
  });

  it("cae en «Hotel» cuando el archivo no declara nada usable", () => {
    expect(proposeHotelName("   ", [])).toBe("Hotel");
  });
});

describe("findHotelForIdentity", () => {
  const identity = (hotelName: string): HotelIdentity => ({ hotelName });

  it("devuelve el hotel cuya identidad adoptada coincide, ignorando mayúsculas y acentos", () => {
    const identities = {
      a: identity("CULTURA MANOR"),
      b: identity("HOTEL AMBATO"),
      c: null,
    };
    expect(findHotelForIdentity(hotels, identities, identity("Hotel Ambato"))?.id).toBe("b");
  });

  it("devuelve null cuando ninguno coincide", () => {
    const identities = { a: identity("CULTURA MANOR"), b: null, c: null };
    expect(findHotelForIdentity(hotels, identities, identity("HOSTAL DURÁN"))).toBeNull();
  });

  it("un hotel vacío no coincide con nada: adopta, no choca", () => {
    expect(
      findHotelForIdentity(hotels, { a: null, b: null, c: null }, identity("HOTEL AMBATO")),
    ).toBeNull();
  });
});
