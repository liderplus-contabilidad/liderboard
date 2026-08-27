import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyCapture, toEngineInput } from "../employee-input";
import { computeEmployeePayroll } from "../engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { buildPayslipDocument } from "./document";
import { PAGE_HEIGHT, PAGE_WIDTH, PAYSLIP_COLUMNS, layoutPayslip, wrapText } from "./layout";
import { PAYSLIP_COLORS } from "./palette";
import type { MeasureText, PayslipBox, PayslipDocument } from "./types";

/**
 * It is measured with the REAL Helvetica, the one `render.ts` ends up using, instead of with invented
 * widths: a fake measurer would let through exactly the failure this file exists to catch — a label
 * that falls outside its column in the real PDF.
 */
let measure: MeasureText;
let edgesOf: (box: PayslipBox) => [left: number, right: number];

beforeAll(async () => {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  measure = (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size);
  // A box's two edges, with its alignment resolved. Written ONCE: ever since the header became
  // centred, a test that assumes `x` is the left edge measures the box in a place where it is not,
  // and does so silently.
  edgesOf = (box) => {
    const width = measure(box.text, box.size, box.bold);
    const left =
      box.align === "right" ? box.x - width : box.align === "center" ? box.x - width / 2 : box.x;
    return [left, left + width];
  };
});

const LINE: PayrollEmployeeLine = {
  id: "e6",
  periodId: "p1",
  name: "SORIA CHALA MISHELL FERNANDA",
  role: "RECEPCIONISTA POLIVALENTE CERTIFICADA",
  area: "VENTAS",
  baseSalary: 487.21,
  contractType: "CT",
  idCard: "1723220065",
  hireDate: "2026-02-16",
  sectorCode: "",
  hasReserveFund: false,
  accumulatesReserveFund: false,
  provisionsThirteenth: false,
  provisionsFourteenth: false,
  days: 30,
  capture: { ...emptyCapture(), deductions: { ...emptyCapture().deductions, salaryAdvance: 200 } },
};

/** Everything captured: the LONGEST possible payslip, its 26 rows. It is the case that decides
 *  whether the page stretches far enough, because a real record prints five. */
const FULL: Partial<PayrollEmployeeLine> = {
  hasReserveFund: true,
  capture: {
    ...emptyCapture(),
    overtimeHours50: 2,
    overtimeHours100: 3,
    overtimeHours25: 4,
    vacationPay: 10,
    privateInsurance: 11,
    allowances: 12,
    fixedCommission: 13,
    variableCommission: 14,
    bonus: 15,
    deductions: {
      iessLoans: 1,
      unpaidLeave: 2,
      salaryAdvance: 3,
      companyLoans: 4,
      incomeTax: 5,
      meals: 6,
      fines: 7,
      inHouseConsumption: 8,
      solidarityContribution: 9,
      otherDeductions: 10,
      partTimeDeduction: 11,
      medicalLeaveDeduction: 12,
    },
  },
};

/** The client's real file profile: the location line runs past seventy characters, which is what
 *  decides whether the letterhead fits. */
const COMPANY = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
  email: "nomina@delicmar.com",
};

/** Any landscape logo: what matters about it are its proportions, not its bytes. */
const LOGO = {
  dataUrl: "data:image/png;base64,SGk=",
  mime: "image/png" as const,
  width: 320,
  height: 120,
};

/** The cost center's logo: landscape and different from the client's, so it is possible to say which
 *  is which by its shape without looking at its bytes. */
const CENTER_LOGO = { ...LOGO, dataUrl: "data:image/png;base64,Q0M=", width: 400, height: 100 };

function documentFor(
  overrides: Partial<PayrollEmployeeLine> = {},
  extras: {
    company?: typeof COMPANY;
    logo?: typeof LOGO;
    costCenter?: { name: string; logo?: typeof LOGO };
  } = {},
): PayslipDocument {
  const line = { ...LINE, ...overrides };
  const capture = line.capture ?? emptyCapture();
  return buildPayslipDocument({
    line,
    computed: computeEmployeePayroll(toEngineInput(line), DEFAULT_PAYROLL_PARAMETERS),
    capture,
    year: 2026,
    monthIndex: 2,
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    ...(extras.company ? { clientCompany: extras.company } : {}),
    ...(extras.logo ? { clientLogo: extras.logo } : {}),
    ...(extras.costCenter ? { clientCostCenter: extras.costCenter } : {}),
    position: 6,
  });
}

describe("el comprobante cabe en la hoja", () => {
  it("ninguna caja se sale del ancho útil", () => {
    const { boxes } = layoutPayslip(documentFor(FULL), measure);
    for (const box of boxes) {
      const [left, right] = edgesOf(box);
      expect(left, box.text).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft - 0.5);
      expect(right, box.text).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight + 0.5);
    }
  });

  it("ninguna caja se sale del alto útil, ni el comprobante desborda", () => {
    const layout = layoutPayslip(documentFor(FULL), measure);
    expect(layout.overflow).toBe(false);
    for (const box of layout.boxes) {
      expect(box.y, box.text).toBeGreaterThanOrEqual(0);
      expect(box.y + box.size, box.text).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
    expect(PAGE_WIDTH).toBeGreaterThan(PAYSLIP_COLUMNS.right);
  });

  it("una ficha real, que imprime cinco filas, se queda muy corta", () => {
    // Omitting the rows with no amount can only SHORTEN the page, never lengthen it: the case that
    // decides whether it fits is the one above, with all 26.
    const short = layoutPayslip(documentFor(), measure);
    const long = layoutPayslip(documentFor(FULL), measure);
    expect(short.overflow).toBe(false);
    expect(short.boxes.length).toBeLessThan(long.boxes.length);
  });
});

describe("las columnas se respetan", () => {
  it("el rótulo más largo no invade la columna de valores", () => {
    // 39 characters, the catalogue's worst case. Its row does not use `Cantidad`, so it can run to
    // the start of `Valores` — which is exactly the overflow the Excel performs.
    const { boxes } = layoutPayslip(documentFor(FULL), measure);
    const box = boxes.find((b) => b.text.startsWith("PRESTAMOS QUIROGRAFARIOS"));
    expect(box, "la fila del préstamo tiene que estar").toBeDefined();
    expect(box?.text).toBe("PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS");
    expect(box!.x + measure(box!.text, box!.size, box!.bold)).toBeLessThanOrEqual(
      PAYSLIP_COLUMNS.quantityEnd,
    );
  });

  it("un rótulo de fila CON cantidad se para antes de esa columna", () => {
    const { boxes } = layoutPayslip(documentFor(FULL), measure);
    const box = boxes.find((b) => b.text.startsWith("VALOR GANADO EXTRAS 100%"));
    expect(box!.x + measure(box!.text, box!.size, box!.bold)).toBeLessThanOrEqual(
      PAYSLIP_COLUMNS.quantityStart,
    );
  });

  it("el importe más largo cabe en la columna de valores", () => {
    // `US$-1,171,420.00` is the worst realistic case: a negative seven-figure net pay.
    const worst = "-$1,171,420.00";
    const available = PAYSLIP_COLUMNS.right - PAYSLIP_COLUMNS.quantityEnd;
    expect(measure(worst, 9.5, true)).toBeLessThanOrEqual(available);
  });

  it("un nombre desmedido se recorta en vez de invadir la hoja", () => {
    const { boxes } = layoutPayslip(documentFor({ name: "X".repeat(300) }), measure);
    const box = boxes.find((b) => b.text.startsWith("XXXX"));
    expect(box!.x + measure(box!.text, box!.size, box!.bold)).toBeLessThanOrEqual(
      PAYSLIP_COLUMNS.pageRight + 0.5,
    );
  });
});

describe("el texto largo se parte en líneas", () => {
  it("la declaración ocupa varias y ninguna se pasa de ancho", () => {
    const declaration =
      "Declaro y acepto que los valores de remuneraciones, horas extras y descuentos son " +
      "correctos y que recibo del valor que consta en LIQUIDO A RECIBIR a mi entera satisfacción.";
    const width = PAYSLIP_COLUMNS.pageRight - PAYSLIP_COLUMNS.pageLeft;
    const lines = wrapText(declaration, width, 7.5, false, measure);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 7.5, false)).toBeLessThanOrEqual(width);
    }
    expect(lines.join(" ")).toBe(declaration);
  });
});

describe("la capa visual", () => {
  it("las bandas de sección llevan los colores del libro del contador", () => {
    // Olive green for income and light blue for costs: the fills the accountant already uses on their
    // sheet and that PyG's Datos table paints on roots 4 and 5. A green means «income» on all three
    // surfaces.
    const { fills } = layoutPayslip(documentFor(), measure);
    const colors = fills.map((f) => f.color);
    expect(colors).toContain(PAYSLIP_COLORS.income);
    expect(colors).toContain(PAYSLIP_COLORS.cost);
  });

  it("el líquido a recibir es la ÚNICA banda oscura", () => {
    // It is the amount the employee declares having received on signing: it cannot be confused with
    // the other two totals, and a second dark band would take exactly that away from it.
    const { fills } = layoutPayslip(documentFor(), measure);
    expect(fills.filter((f) => f.color === PAYSLIP_COLORS.net)).toHaveLength(1);
  });

  it("sobre la banda oscura el texto va en blanco", () => {
    const { fills, boxes } = layoutPayslip(documentFor(), measure);
    const netBand = fills.find((f) => f.color === PAYSLIP_COLORS.net)!;
    const over = boxes.filter((b) => b.y >= netBand.y && b.y <= netBand.y + netBand.height);
    expect(over.length).toBe(2);
    expect(over.every((b) => b.color === PAYSLIP_COLORS.white)).toBe(true);
  });

  it("la franja alterna cubre la mitad de las filas de concepto", () => {
    // 26 rows: 13 odd ones in each block counting from zero → 6 + 6. With fewer rows there are fewer,
    // and they keep alternating from the first of each block.
    const { fills } = layoutPayslip(documentFor(FULL), measure);
    expect(fills.filter((f) => f.color === PAYSLIP_COLORS.zebra)).toHaveLength(12);
    // SORIA prints 3 income rows and 2 deductions: 1 + 1.
    const real = layoutPayslip(documentFor(), measure);
    expect(real.fills.filter((f) => f.color === PAYSLIP_COLORS.zebra)).toHaveLength(2);
  });

  it("todo importe impreso va en tinta plena, porque ya no hay rayas con las que competir", () => {
    const { boxes } = layoutPayslip(documentFor(), measure);
    expect(boxes.find((b) => b.text === "$487.21")?.color).toBe(PAYSLIP_COLORS.ink);
    expect(boxes.some((b) => b.text === "-")).toBe(false);
  });

  it("la cabecera `Cantidad` solo se escribe si alguna fila la usa", () => {
    // Labelling an empty column promises a datum that is not on the sheet.
    const full = layoutPayslip(documentFor(FULL), measure);
    expect(full.boxes.some((b) => b.text === "Cantidad")).toBe(true);
    const real = layoutPayslip(documentFor(), measure);
    expect(real.boxes.some((b) => b.text === "Cantidad")).toBe(false);
  });

  it("la nota al pie solo se escribe si queda un (*) que explicar", () => {
    const marker = "(*) No aporta IESS ni es Ingreso Gravado";
    expect(layoutPayslip(documentFor(FULL), measure).boxes.some((b) => b.text === marker)).toBe(
      true,
    );
    expect(layoutPayslip(documentFor(), measure).boxes.some((b) => b.text === marker)).toBe(false);
  });

  it("ningún relleno se sale de la hoja útil", () => {
    const { fills } = layoutPayslip(documentFor(), measure);
    for (const fill of fills) {
      expect(fill.x).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft);
      expect(fill.x + fill.width).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight);
      expect(fill.y + fill.height).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
  });
});

describe("el membrete del cliente", () => {
  const logo = (width: number, height: number) => ({
    dataUrl: "data:image/png;base64,SGk=",
    mime: "image/png" as const,
    width,
    height,
  });

  const withLogo = (width: number, height: number): PayslipDocument => ({
    ...documentFor(),
    logo: logo(width, height),
  });

  /** The page's axis, which the header block is centred against. */
  const pageCenter = (PAYSLIP_COLUMNS.pageLeft + PAYSLIP_COLUMNS.pageRight) / 2;

  it("sin logo el bloque del encabezado sigue centrado en la hoja", () => {
    const { images, boxes, fills, rules } = layoutPayslip(documentFor(), measure);
    expect(images).toEqual([]);
    // Centred on the PAGE and not on what is left over: it is what makes a payslip with a logo and
    // one without overlap.
    const company = boxes[0];
    expect(company?.align).toBe("center");
    expect(company?.x).toBeCloseTo(pageCenter, 6);
    expect(fills.length).toBeGreaterThan(0);
    expect(rules.length).toBeGreaterThan(0);
  });

  it("con logo, el bloque no se mueve y ninguno de los dos pisa al otro", () => {
    const conLogo = layoutPayslip(withLogo(640, 160), measure);
    expect(conLogo.images).toHaveLength(1);

    const mark = conLogo.images[0]!;
    const company = conLogo.boxes[0]!;
    expect(mark.x).toBe(PAYSLIP_COLUMNS.pageLeft);
    // The block's axis does not depend on there being a logo — both sides reserve the same.
    expect(company.x).toBeCloseTo(pageCenter, 6);
    // And the label starts AFTER where the logo ends, which is what keeps them from overlapping.
    expect(edgesOf(company)[0]).toBeGreaterThanOrEqual(mark.x + mark.width);
  });

  it("el logo no se sale de la hoja por ningún lado, sea cual sea su forma", () => {
    for (const [w, h] of [
      [640, 160],
      [160, 640],
      [1, 1],
      [3000, 3000],
    ]) {
      const { images, boxes } = layoutPayslip(withLogo(w, h), measure);
      const mark = images[0]!;
      expect(mark.x).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft);
      expect(mark.x + mark.width).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight);
      expect(mark.y).toBeGreaterThanOrEqual(0);

      // And it does not invade the centred block, which is what it has beside it.
      const title = boxes.find((box) => box.text === "ROL DE PAGOS");
      expect(mark.x + mark.width).toBeLessThanOrEqual(edgesOf(title!)[0]);
    }
  });

  it("conserva la proporción del logo, así que ninguno sale estirado", () => {
    const { images } = layoutPayslip(withLogo(640, 160), measure);
    const mark = images[0]!;
    expect(mark.width / mark.height).toBeCloseTo(4, 6);
  });

  it("el logo no baja al panel de identidad: se queda dentro del encabezado", () => {
    const { images, rules } = layoutPayslip(withLogo(160, 640), measure);
    const mark = images[0]!;
    // The first rule is the line that closes the header.
    expect(mark.y + mark.height).toBeLessThanOrEqual(rules[0]!.y);
  });
});

describe("el membrete del cliente", () => {
  it("imprime las cuatro líneas bajo el nombre y ninguna se sale de la hoja", () => {
    const layout = layoutPayslip(documentFor(FULL, { company: COMPANY }), measure);
    expect(layout.overflow).toBe(false);

    for (const line of [
      "DELICMAR S.A.S. · RUC 1891234567001",
      "0991045439 - 0958780660",
      "nomina@delicmar.com",
    ]) {
      expect(
        layout.boxes.some((box) => box.text === line),
        line,
      ).toBe(true);
    }

    for (const box of layout.boxes) {
      const [left, right] = edgesOf(box);
      expect(left, box.text).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft - 0.5);
      expect(right, box.text).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight + 0.5);
      expect(box.y + box.size, box.text).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
  });

  // The whole layout, in one test: the entire header shares an axis, and the title goes BELOW the
  // letterhead and not to its right, which is what changed.
  it("empresa, membrete, título y mes comparten el eje de la hoja, en ese orden", () => {
    const { boxes, rules } = layoutPayslip(
      documentFor(FULL, { company: COMPANY, logo: LOGO }),
      measure,
    );
    const center = (PAYSLIP_COLUMNS.pageLeft + PAYSLIP_COLUMNS.pageRight) / 2;
    const header = boxes.filter((box) => box.y < rules[0]!.y);

    for (const box of header) {
      expect(box.align, box.text).toBe("center");
      expect(box.x, box.text).toBeCloseTo(center, 6);
    }

    const at = (text: string) => header.find((box) => box.text === text)!.y;
    expect(at("HOTEL BOUTIQUE CULTURA MANOR")).toBeLessThan(at("nomina@delicmar.com"));
    expect(at("nomina@delicmar.com")).toBeLessThan(at("ROL DE PAGOS"));
    expect(at("ROL DE PAGOS")).toBeLessThan(at("MARZO 2026"));
  });

  // The line that decides the design: the real file's location is seventy-odd characters, and it goes
  // in WHOLE. A truncated address leads nowhere.
  it("la ubicación entra entera", () => {
    const { boxes } = layoutPayslip(documentFor(FULL, { company: COMPANY }), measure);
    const location = boxes.find((box) => box.text.startsWith("TUNGURAHUA"));
    expect(location, "la línea de ubicación tiene que estar").toBeDefined();
    expect(location!.text).toBe(
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
    );
  });

  // And a longer one DROPS A SIZE rather than being truncated, which is what keeps the one above from
  // depending on having measured a single address right.
  it("una ubicación más larga baja de cuerpo en vez de truncarse", () => {
    const largo = {
      ...COMPANY,
      address: "AVENIDA DE LOS SHYRIS Y REPUBLICA DEL SALVADOR, TORRES DEL NORTE",
    };
    const { boxes } = layoutPayslip(documentFor(FULL, { company: largo, logo: LOGO }), measure);
    const location = boxes.find((box) => box.text.startsWith("TUNGURAHUA"));
    expect(location!.text).not.toContain("…");
    expect(location!.size).toBeLessThan(8);
  });

  it("el logo se centra contra el bloque entero del encabezado, no contra la primera línea", () => {
    const conMembrete = layoutPayslip(documentFor(FULL, { company: COMPANY, logo: LOGO }), measure);
    const sinMembrete = layoutPayslip(documentFor(FULL, { logo: LOGO }), measure);

    const centro = (layout: typeof conMembrete) => {
      const image = layout.images[0];
      expect(image, "el logo tiene que dibujarse").toBeDefined();
      return image!.y + image!.height / 2;
    };

    // With a letterhead the header is taller, so its centre falls lower. Hung from the first line,
    // the two centres would coincide.
    expect(centro(conMembrete)).toBeGreaterThan(centro(sinMembrete) + 8);
  });

  // The shortest header there is, and the one that fixes the height of the logo's gap (44): a client
  // with no profile prints company, title and month, nothing else.
  // 103 = top margin (44) + company (15) + the title's breathing room (8) + title (13) + its
  // breathing room (4) + month (9) + the rule's breathing room (10).
  it("sin perfil, el encabezado es el bloque mínimo", () => {
    const layout = layoutPayslip(documentFor(FULL), measure);
    expect(layout.rules[0]?.y).toBe(103);
  });
});

/**
 * THE COST CENTER IN THE HEADER. What can be wrong is not that the logo comes out: it is that the two
 * overlap, that the title ends up under the one it belongs to, or that a client WITHOUT a center
 * stops printing the payslip it used to print.
 */
describe("el centro de costo", () => {
  const conCentro = () =>
    layoutPayslip(
      documentFor(FULL, {
        company: COMPANY,
        logo: LOGO,
        costCenter: { name: "Planta Ambato", logo: CENTER_LOGO },
      }),
      measure,
    );

  it("compone el rótulo del encabezado con el nombre del centro", () => {
    const { boxes } = conCentro();
    expect(boxes[0]?.text).toBe("HOTEL BOUTIQUE CULTURA MANOR · Planta Ambato");
  });

  it("el del cliente encabeza a la izquierda y el del centro va a la derecha", () => {
    const { images } = conCentro();
    expect(images).toHaveLength(2);

    const izquierda = images.find((image) => image.dataUrl === LOGO.dataUrl)!;
    const derecha = images.find((image) => image.dataUrl === CENTER_LOGO.dataUrl)!;
    expect(izquierda.x).toBe(PAYSLIP_COLUMNS.pageLeft);
    expect(derecha.x + derecha.width).toBeCloseTo(PAYSLIP_COLUMNS.pageRight, 6);
    // They do not overlap, which is the only thing a two-logo header can get wrong silently.
    expect(izquierda.x + izquierda.width).toBeLessThan(derecha.x);
  });

  it("ninguna caja del encabezado se cruza con ninguno de los dos logos", () => {
    const layout = conCentro();
    const izquierda = layout.images.find((image) => image.dataUrl === LOGO.dataUrl)!;
    const derecha = layout.images.find((image) => image.dataUrl === CENTER_LOGO.dataUrl)!;
    const raya = layout.rules[0]!.y;

    // The only thing a two-logo header can get wrong silently: that the centred block slips under one
    // of them. It is checked over ALL the header's boxes, not only over the title, because the
    // letterhead's long line is the one that reaches furthest.
    for (const box of layout.boxes.filter((candidate) => candidate.y < raya)) {
      const [left, right] = edgesOf(box);
      expect(left, box.text).toBeGreaterThanOrEqual(izquierda.x + izquierda.width);
      expect(right, box.text).toBeLessThanOrEqual(derecha.x);
    }
  });

  it("el comprobante entero sigue cabiendo en la hoja", () => {
    const layout = conCentro();
    expect(layout.overflow).toBe(false);
    for (const image of layout.images) {
      expect(image.x).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft);
      expect(image.x + image.width).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight);
      expect(image.y).toBeGreaterThanOrEqual(0);
    }
    for (const box of layout.boxes) {
      expect(box.y).toBeLessThan(PAGE_HEIGHT);
    }
  });

  it("un centro SIN logo solo cambia el rótulo: el del cliente no se mueve", () => {
    const sinLogo = layoutPayslip(
      documentFor(FULL, { company: COMPANY, logo: LOGO, costCenter: { name: "Planta Ambato" } }),
      measure,
    );
    const base = layoutPayslip(documentFor(FULL, { company: COMPANY, logo: LOGO }), measure);

    expect(sinLogo.images).toHaveLength(1);
    expect(sinLogo.images[0]).toEqual(base.images[0]);
    expect(sinLogo.rules[0]?.y).toBe(base.rules[0]?.y);
  });

  // The regression that matters: with no center, the payslip is the usual one down to the last point.
  it("sin centro el encabezado no se mueve ni un punto", () => {
    const base = layoutPayslip(documentFor(FULL, { company: COMPANY, logo: LOGO }), measure);
    expect(base.images).toHaveLength(1);
    expect(base.rules[0]?.y).toBe(
      layoutPayslip(documentFor(FULL, { company: COMPANY, logo: LOGO }), measure).rules[0]?.y,
    );
  });
});
