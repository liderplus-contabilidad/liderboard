import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, PrintScaling, decodePDFRawStream } from "pdf-lib";
import { createCheckPdf, createCheckTestPdf } from "./download";
import { CHECK_FIELDS, mmToPt, resolveCheckLayout } from "./layout";

describe("check PDF physical dimensions", () => {
  it.each(["Banco Pichincha", "pichincha"])(
    "reproduces the supplied bank PDF's actual coordinates and text for %s",
    async (bank) => {
      const account = { bank, number: "123" };
      const input = {
        payee: "COMPANIA DE ECONOMIA MIXTA HOTELERA Y TURISTICA",
        number: "20202609000297",
        amount: 49.3,
        date: "2026-09-21",
      };
      const preview = await createCheckPdf(input, account);
      const pdf = await PDFDocument.load(await preview.blob.arrayBuffer());
      expect(pdf.getPageCount()).toBe(1);
      const page = pdf.getPage(0);
      expect(page.getWidth()).toBeCloseTo(841.8898, 8);
      expect(page.getHeight()).toBeCloseTo(595.2756, 8);
      expect(page.getCropBox()).toEqual(page.getMediaBox());
      expect(page.getRotation().angle).toBe(0);
      const streams = page.node.Contents() as PDFArray;
      const content = Array.from({ length: streams.size() }, (_, index) =>
        new TextDecoder().decode(decodePDFRawStream(streams.lookup(index, PDFRawStream)).decode()),
      ).join("\n");
      const texts = [
        ...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([A-Fa-f0-9]+)> Tj/g),
      ].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
        text: new TextDecoder("windows-1252").decode(Buffer.from(match[3], "hex")),
      }));
      // Independent measurements from the source PDF, after its translation matrix.
      const expected = [
        { text: "$49,30", x: 771.3543, y: 336.99214 },
        { text: input.payee, x: 462.378, y: 336.99214 },
        { text: "Cuarenta y nueve con 30/100 dólares" + "*".repeat(46), x: 462.378, y: 317.14964 },
        { text: "Ambato, 2026/09/21", x: 417.0236, y: 285.96854 },
        { text: "*".repeat(95), x: 414.189, y: 297.30704 },
      ];
      expect(texts).toHaveLength(expected.length);
      expected.forEach((value, index) => {
        expect(texts[index].text).toBe(value.text);
        expect(texts[index].x).toBeCloseTo(value.x, 8);
        expect(texts[index].y).toBeCloseTo(value.y, 8);
      });
      expect([...content.matchAll(/ ([\d.]+) Tf/g)].map((match) => Number(match[1]))).toEqual(
        Array(5).fill(10),
      );
      expect(pdf.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe(PrintScaling.None);
      const test = await createCheckTestPdf(account, input.date);
      const testPdf = await PDFDocument.load(await test.blob.arrayBuffer());
      expect(testPdf.getPage(0).getMediaBox()).toEqual(page.getMediaBox());
      expect(account).toEqual({ bank, number: "123" });
    },
  );

  it.each([
    { width: 180.25, height: 82.5, fontSize: 9.5, offsetX: 1.25, offsetY: -0.75 },
    { width: 175.5, height: 79.25, fontSize: 11, offsetX: -1.5, offsetY: 2.25 },
  ])(
    "preserves account configuration in PDF page, text and print preferences: %j",
    async (settings) => {
      const layout = resolveCheckLayout({ ...settings, city: "Loja" });
      const before = structuredClone(layout);
      const account = { bank: "BANCO", number: "123", checkLayout: layout };
      const preview = await createCheckPdf(
        { payee: "PROVEEDOR", number: "12", amount: 10, date: "2026-09-23" },
        account,
      );
      expect(preview.blob.type).toBe("application/pdf");
      const pdf = await PDFDocument.load(await preview.blob.arrayBuffer());
      expect(pdf.getPageCount()).toBe(1);
      const page = pdf.getPage(0);
      expect(page.getMediaBox()).toEqual({
        x: 0,
        y: 0,
        width: mmToPt(layout.width),
        height: mmToPt(layout.height),
      });
      expect(page.getCropBox()).toEqual(page.getMediaBox());
      expect(page.getRotation().angle).toBe(0);
      const preferences = pdf.catalog.getOrCreateViewerPreferences();
      expect(preferences.getPrintScaling()).toBe(PrintScaling.None);
      expect(preferences.getPickTrayByPDFSize()).toBe(true);

      const streams = page.node.Contents() as PDFArray;
      const content = Array.from({ length: streams.size() }, (_, index) =>
        new TextDecoder().decode(decodePDFRawStream(streams.lookup(index, PDFRawStream)).decode()),
      ).join("\n");
      const positions = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)];
      expect(positions).toHaveLength(4);
      CHECK_FIELDS.forEach((field, index) => {
        expect(Number(positions[index][1])).toBeCloseTo(
          mmToPt(layout[field].x + layout.offsetX),
          8,
        );
        expect(Number(positions[index][2])).toBeCloseTo(
          mmToPt(layout.height) - mmToPt(layout[field].y + layout.offsetY),
          8,
        );
      });
      expect([...content.matchAll(/ ([\d.]+) Tf/g)].map((match) => Number(match[1]))).toEqual(
        Array(4).fill(layout.fontSize),
      );
      // Production check contains text only: no test borders, labels or HTML header/footer.
      expect(content).not.toMatch(/\bre\b|\bl\b/);

      const testPreview = await createCheckTestPdf(account, "2026-09-23");
      const testPdf = await PDFDocument.load(await testPreview.blob.arrayBuffer());
      expect(testPdf.getPage(0).getMediaBox()).toEqual(page.getMediaBox());
      expect(layout).toEqual(before);
    },
  );
});
