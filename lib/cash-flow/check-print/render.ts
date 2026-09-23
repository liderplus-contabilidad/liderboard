/**
 * THE ONLY FILE OF THIS FOLDER THAT TOUCHES `pdf-lib`. It draws `PrintPage`s — the check's and the
 * comprobante's alike — and decides nothing: every position, size and word was decided by the pure
 * layouts. Imported dynamically (through `download.ts`), so whoever never prints a check never pays
 * the library.
 *
 * Helvetica, one of the PDF's fourteen base fonts: nothing is embedded, and it is the font the real
 * checks were printed with.
 */
import { decodeLogoBytes } from "@/lib/logos";
import type { MeasureText, PrintPage } from "./types";

/** The base fonts are WinAnsi: a character outside it would make pdf-lib THROW, so it prints `?`
 *  instead — the same rule as the payslip. */
function toWinAnsi(text: string): string {
  return text.normalize("NFC").replace(/[^ -ÿ–—‘’“”…]/g, "?");
}

/**
 * Builds the pages with a measurer of the REAL font and draws them into one PDF. The layout comes in
 * as a function of the measurer because the widths it clips and shrinks against are Helvetica's.
 */
export async function renderPrintPages(
  build: (measure: MeasureText) => readonly PrintPage[],
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const measure: MeasureText = (text, size, isBold) =>
    (isBold ? bold : regular).widthOfTextAtSize(toWinAnsi(text), size);

  const color = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  };

  for (const layout of build(measure)) {
    const page = pdf.addPage([layout.width, layout.height]);
    const top = layout.height;

    for (const rect of layout.rects) {
      page.drawRectangle({
        x: rect.x,
        // pdf-lib places a rectangle by its BOTTOM-left corner; the layout counts from the top.
        y: top - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        ...(rect.fill ? { color: color(rect.fill) } : {}),
        ...(rect.stroke ? { borderColor: color(rect.stroke), borderWidth: 0.6 } : {}),
      });
    }

    for (const image of layout.images) {
      const bytes = decodeLogoBytes(image.logo);
      const embedded =
        image.logo.mime === "image/jpeg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      page.drawImage(embedded, {
        x: image.x,
        y: top - image.y - image.height,
        width: image.width,
        height: image.height,
      });
    }

    for (const rule of layout.rules) {
      page.drawLine({
        start: { x: rule.x1, y: top - rule.y },
        end: { x: rule.x2, y: top - rule.y },
        thickness: rule.thickness,
        color: color(rule.color),
      });
    }

    for (const box of layout.texts) {
      const font = box.bold ? bold : regular;
      const text = toWinAnsi(box.text);
      const width = font.widthOfTextAtSize(text, box.size);
      const x =
        box.align === "right" ? box.x - width : box.align === "center" ? box.x - width / 2 : box.x;
      // The layout gives the BASELINE, which is what pdf-lib's `y` is.
      page.drawText(text, { x, y: top - box.y, size: box.size, font, color: color(box.color) });
    }
  }

  return pdf.save();
}
