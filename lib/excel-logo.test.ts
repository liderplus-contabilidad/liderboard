import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  bandWidthFor,
  columnAnchorAt,
  columnWidthPx,
  writeLetterhead,
  type ColumnAnchor,
} from "./excel-logo";

describe("columnWidthPx", () => {
  it("convierte caracteres a píxeles con la regla de Excel (7 por carácter + 5)", () => {
    expect(columnWidthPx(12)).toBe(89);
    expect(columnWidthPx(42)).toBe(299);
  });

  // It is what makes anchoring against an Ocupaciones sheet —where only column A declares a width—
  // land where it really lands and not in column B.
  it("una columna que nadie declaró vale los 64 px de una columna en blanco", () => {
    expect(columnWidthPx(undefined)).toBe(64);
  });
});

describe("columnAnchorAt", () => {
  // The widths of an estado de resultados sheet: code, name and months.
  const statement = [12, 42, 13, 13, 13];
  const EMU = 9525;

  it("un desplazamiento de cero es el borde izquierdo", () => {
    expect(columnAnchorAt(statement, 0)).toEqual({ nativeCol: 0, nativeColOff: 0 });
  });

  // exceljs' fractional form (`col: 1.81`) does NOT serve here: its Anchor converts it with
  // `characters × 10000` EMU per column when a character measures ~66,700, so it shrinks more than
  // sixfold and the logo appears at the start of the column instead of at the end. That is why the
  // offset travels in EMU, which is the format's own unit.
  it("cae DENTRO de la columna que lo contiene, con el resto en EMU", () => {
    // 89 (code) + 299 (name) = 388; at 332 px there are 243 left inside the name column.
    expect(columnAnchorAt(statement, 332)).toEqual({
      nativeCol: 1,
      nativeColOff: 243 * EMU,
    });
  });

  it("el borde exacto entre dos columnas es el principio de la siguiente, sin resto", () => {
    expect(columnAnchorAt(statement, 89)).toEqual({ nativeCol: 1, nativeColOff: 0 });
    expect(columnAnchorAt(statement, 89 + 299)).toEqual({ nativeCol: 2, nativeColOff: 0 });
  });

  it("pasada la última columna declarada sigue contando en columnas en blanco", () => {
    // 388 of the first two + 3 × 96 = 676 exhausts what is declared; the rest is 64 px each.
    expect(columnAnchorAt(statement, 676 + 64)).toEqual({ nativeCol: 6, nativeColOff: 0 });
  });

  it("una hoja sin ningún ancho declarado cuenta todo a 64 px", () => {
    expect(columnAnchorAt([], 128)).toEqual({ nativeCol: 2, nativeColOff: 0 });
  });

  it("un desplazamiento negativo no produce un ancla negativa", () => {
    expect(columnAnchorAt(statement, -50)).toEqual({ nativeCol: 0, nativeColOff: 0 });
  });

  it("un desplazamiento disparatado se detiene en vez de girar para siempre", () => {
    expect(columnAnchorAt(statement, 10_000_000).nativeCol).toBe(256);
  });
});

describe("bandWidthFor", () => {
  /** PyG: code (12) + name (42), and month columns behind. */
  const statement = [12, 42, 13, 13, 13];
  /** Ocupaciones: one single wide label column, and a day per column behind. */
  const occupancy = [40];

  // The fix the firm asked for: the corner of the TABLE, not the end of the label block, which at
  // 390 px does not read as the edge of anything but as something floating among the figures.
  it("acaba donde acaba la tabla, no donde acaban los rótulos", () => {
    expect(bandWidthFor(statement, 5, 56, 56)).toBe(89 + 299 + 96 * 3);
  });

  it("solo cuenta las columnas que la tabla ocupa", () => {
    // A single-mode statement is three columns: code, name and Total.
    expect(bandWidthFor(statement, 3, 56, 56)).toBe(89 + 299 + 96);
  });

  // The columns nobody declared are worth the 64 px of a blank column, which is what an Ocupaciones
  // sheet measures beyond its label column.
  it("cuenta a 64 px las columnas de la tabla que no declaran ancho", () => {
    expect(bandWidthFor(occupancy, 4, 56, 56)).toBe(285 + 64 * 3);
  });

  // Without this, a single-mode statement (three columns, 484 px) would not have room for two
  // landscape logos of 240 and the center's would be drawn ON TOP of the client's, which is not a
  // letterhead but a smudge.
  it("se ensancha lo justo cuando los dos logos no caben en la tabla", () => {
    expect(bandWidthFor([12], 1, 240, 240)).toBe(240 + 16 + 240);
  });

  it("el logo derecho nunca empieza antes de donde acaba el izquierdo", () => {
    for (const [left, right] of [
      [240, 240],
      [56, 240],
      [240, 56],
      [56, 56],
    ]) {
      expect(bandWidthFor(occupancy, 1, left, right) - right).toBeGreaterThanOrEqual(left);
    }
  });

  it("sin logo izquierdo la banda sigue siendo la tabla", () => {
    expect(bandWidthFor(statement, 2, 0, 56)).toBe(388);
  });
});

describe("writeLetterhead", () => {
  /** A square 100 px logo: `fitLogoBox` leaves it at 56 × 56, the height of the gap. */
  const logo = {
    dataUrl: "data:image/png;base64,AAAA",
    mime: "image/png" as const,
    width: 100,
    height: 100,
  };

  /** An estado de resultados sheet: code, name and three figure columns. */
  function sheet() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hoja");
    ws.columns = [{ width: 12 }, { width: 42 }, { width: 13 }, { width: 13 }, { width: 13 }];
    return { wb, ws };
  }

  it("centra el bloque de título combinándolo hasta la última columna de la tabla", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, {
      columns: 5,
      lines: [{ text: "DELICMAR S.A." }, { text: "Estado de Resultados" }],
    });

    expect(ws.getCell("A1").alignment?.horizontal).toBe("center");
    expect(ws.getCell("A1").isMerged).toBe(true);
    // The merge reaches the fifth column: the table's corner, not the label block's.
    expect(ws.getCell("E1").master.address).toBe("A1");
    expect(ws.getCell("E2").master.address).toBe("A2");
  });

  // It is what holds up the round trip of all three modules without touching a single reader: a
  // merged cell's value lives in its top-left corner.
  it("deja el texto en la columna que el lector del módulo ya mira", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, lines: [{ text: "DELICMAR S.A." }] });
    expect(ws.getCell("A1").value).toBe("DELICMAR S.A.");
  });

  it("combina desde la columna que se le pide, para el lector que busca en la B", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, firstColumn: 2, lines: [{ text: "DELICMAR S.A." }] });

    expect(ws.getCell("B1").value).toBe("DELICMAR S.A.");
    expect(ws.getCell("B1").master.address).toBe("B1");
    // Column A stays OUTSIDE the merge, but inside the band: the fill reaches the edge.
    expect(ws.getCell("A1").isMerged).toBe(false);
    expect(ws.getCell("A1").fill).toBeDefined();
  });

  // What makes it look like a header and not loose text in A1.
  it("pinta la banda a lo ancho de la tabla y la cierra con una raya", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, lines: [{ text: "Uno" }, { text: "Dos" }] });

    expect(ws.getCell("E1").fill).toBeDefined();
    expect(ws.getCell("E2").border?.bottom?.style).toBe("thin");
    // The rule closes the whole band, not just the last line of text.
    expect(ws.getCell("A2").border?.bottom?.style).toBe("thin");
    expect(ws.getCell("A1").border?.bottom).toBeUndefined();
  });

  it("abre las filas que pide el logo cuando el título trae menos líneas", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, leftLogo: logo, lines: [{ text: "Uno" }] });
    // 56 px of logo are three rows of 20; a single title line would leave the logo spilling over.
    expect(ws.rowCount).toBe(3);
  });

  it("no escribe nada sin logos y sin líneas", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5 });
    expect(ws.rowCount).toBe(0);
  });

  it("ancla el logo del centro contra la esquina derecha de la tabla", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, leftLogo: logo, rightLogo: logo, lines: [] });

    const [left, right] = (ws as unknown as { _media: { range: { tl: ColumnAnchor } }[] })._media;
    expect(left?.range.tl).toMatchObject({ nativeCol: 0, nativeColOff: 0 });
    // The table measures 89 + 299 + 96 × 3 = 676 px; the 56 px logo starts at 620, inside the last
    // column (which starts at 580).
    expect(right?.range.tl).toMatchObject(columnAnchorAt([12, 42, 13, 13, 13], 676 - 56));
  });
});
