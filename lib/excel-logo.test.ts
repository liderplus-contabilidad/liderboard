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

  // Es lo que hace que anclar contra una hoja de Ocupaciones —donde solo la columna A declara
  // ancho— caiga donde cae de verdad y no en la columna B.
  it("una columna que nadie declaró vale los 64 px de una columna en blanco", () => {
    expect(columnWidthPx(undefined)).toBe(64);
  });
});

describe("columnAnchorAt", () => {
  // Los anchos de una hoja de estado de resultados: código, nombre y meses.
  const statement = [12, 42, 13, 13, 13];
  const EMU = 9525;

  it("un desplazamiento de cero es el borde izquierdo", () => {
    expect(columnAnchorAt(statement, 0)).toEqual({ nativeCol: 0, nativeColOff: 0 });
  });

  // La forma fraccionaria de exceljs (`col: 1.81`) NO sirve aquí: su Anchor la convierte con
  // `caracteres × 10000` EMU por columna cuando un carácter mide ~66.700, así que encoge más de
  // seis veces y el logo aparece al principio de la columna en vez de al final. Por eso el
  // desplazamiento viaja en EMU, que es la unidad del propio formato.
  it("cae DENTRO de la columna que lo contiene, con el resto en EMU", () => {
    // 89 (código) + 299 (nombre) = 388; a 332 px quedan 243 dentro de la columna del nombre.
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
    // 388 de las dos primeras + 3 × 96 = 676 agota lo declarado; lo que sobra va a 64 px cada una.
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
  /** PyG: código (12) + nombre (42), y detrás columnas de meses. */
  const statement = [12, 42, 13, 13, 13];
  /** Ocupaciones: una sola columna de rótulos, ancha, y detrás un día por columna. */
  const occupancy = [40];

  // El arreglo que pidió la firma: la esquina de la TABLA, no el final del bloque de rótulos, que
  // a 390 px no se lee como el borde de nada sino como algo flotando entre las cifras.
  it("acaba donde acaba la tabla, no donde acaban los rótulos", () => {
    expect(bandWidthFor(statement, 5, 56, 56)).toBe(89 + 299 + 96 * 3);
  });

  it("solo cuenta las columnas que la tabla ocupa", () => {
    // Un estado de modo único son tres columnas: código, nombre y Total.
    expect(bandWidthFor(statement, 3, 56, 56)).toBe(89 + 299 + 96);
  });

  // Las columnas que nadie declaró valen los 64 px de una columna en blanco, que es lo que mide
  // una hoja de Ocupaciones más allá de su columna de rótulos.
  it("cuenta a 64 px las columnas de la tabla que no declaran ancho", () => {
    expect(bandWidthFor(occupancy, 4, 56, 56)).toBe(285 + 64 * 3);
  });

  // Sin esto, un estado de modo único (tres columnas, 484 px) no daría para dos logos apaisados de
  // 240 y el del centro se dibujaría ENCIMA del del cliente, que no es un membrete sino un borrón.
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
  /** Un logo cuadrado de 100 px: `fitLogoBox` lo deja en 56 × 56, el alto del hueco. */
  const logo = {
    dataUrl: "data:image/png;base64,AAAA",
    mime: "image/png" as const,
    width: 100,
    height: 100,
  };

  /** Una hoja de estado de resultados: código, nombre y tres columnas de cifras. */
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
    // La combinación llega a la quinta columna: la esquina de la tabla, no la del bloque de rótulos.
    expect(ws.getCell("E1").master.address).toBe("A1");
    expect(ws.getCell("E2").master.address).toBe("A2");
  });

  // Es lo que sostiene el viaje de vuelta de los tres módulos sin tocar un solo lector: el valor de
  // una celda combinada vive en su esquina superior izquierda.
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
    // La A queda FUERA de la combinación, pero dentro de la banda: el relleno llega al borde.
    expect(ws.getCell("A1").isMerged).toBe(false);
    expect(ws.getCell("A1").fill).toBeDefined();
  });

  // Lo que la hace parecer una cabecera y no texto suelto en A1.
  it("pinta la banda a lo ancho de la tabla y la cierra con una raya", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, lines: [{ text: "Uno" }, { text: "Dos" }] });

    expect(ws.getCell("E1").fill).toBeDefined();
    expect(ws.getCell("E2").border?.bottom?.style).toBe("thin");
    // La raya cierra la banda entera, no solo la última línea de texto.
    expect(ws.getCell("A2").border?.bottom?.style).toBe("thin");
    expect(ws.getCell("A1").border?.bottom).toBeUndefined();
  });

  it("abre las filas que pide el logo cuando el título trae menos líneas", () => {
    const { wb, ws } = sheet();
    writeLetterhead(wb, ws, { columns: 5, leftLogo: logo, lines: [{ text: "Uno" }] });
    // 56 px de logo son tres filas de 20; una sola línea de título dejaría el logo derramándose.
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
    // La tabla mide 89 + 299 + 96 × 3 = 676 px; el logo de 56 empieza en 620, dentro de la última
    // columna (que arranca en 580).
    expect(right?.range.tl).toMatchObject(columnAnchorAt([12, 42, 13, 13, 13], 676 - 56));
  });
});
