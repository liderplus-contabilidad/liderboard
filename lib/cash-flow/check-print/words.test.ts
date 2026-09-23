import { describe, expect, it } from "vitest";
import { amountInWords, integerInWords } from "./words";

describe("amountInWords", () => {
  it("writes the two real checks exactly as the bank's software did", () => {
    expect(amountInWords(499.78)).toBe("CUATROCIENTOS NOVENTA Y NUEVE CON 78/100 DÓLARES");
    expect(amountInWords(377.68)).toBe("TRESCIENTOS SETENTA Y SIETE CON 68/100 DÓLARES");
  });

  it("writes whole amounts with 00/100 and reads the cents from one rounded integer", () => {
    expect(amountInWords(1)).toBe("UNO CON 00/100 DÓLARES");
    expect(amountInWords(9200)).toBe("NUEVE MIL DOSCIENTOS CON 00/100 DÓLARES");
    expect(amountInWords(1_000_000.5)).toBe("UN MILLÓN CON 50/100 DÓLARES");
    expect(amountInWords(0.29)).toBe("CERO CON 29/100 DÓLARES");
    expect(amountInWords(1487.31)).toBe("MIL CUATROCIENTOS OCHENTA Y SIETE CON 31/100 DÓLARES");
  });
});

describe("integerInWords", () => {
  it.each([
    [21, "VEINTIUNO"],
    [100, "CIEN"],
    [101, "CIENTO UNO"],
    [1001, "MIL UNO"],
    [21_000, "VEINTIÚN MIL"],
    [31_000, "TREINTA Y UN MIL"],
    [101_000, "CIENTO UN MIL"],
    [1_000_000, "UN MILLÓN"],
    [2_500_000, "DOS MILLONES QUINIENTOS MIL"],
    [21_000_021, "VEINTIÚN MILLONES VEINTIUNO"],
    [
      999_999_999,
      "NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE",
    ],
  ])("%i → %s", (value, words) => {
    expect(integerInWords(value)).toBe(words);
  });
});
