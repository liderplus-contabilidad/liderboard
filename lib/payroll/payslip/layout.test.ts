import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { emptyCapture, toEngineInput } from "../employee-input";
import { computeEmployeePayroll } from "../engine/compute";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { buildPayslipDocument } from "./document";
import { PAGE_HEIGHT, PAGE_WIDTH, PAYSLIP_COLUMNS, layoutPayslip, wrapText } from "./layout";
import { PAYSLIP_COLORS } from "./palette";
import type { MeasureText, PayslipDocument } from "./types";

/**
 * Se mide con la Helvetica REAL, la que `render.ts` acaba usando, en vez de con anchos inventados:
 * un medidor de mentira dejaría pasar justamente el fallo que este archivo existe para atrapar —
 * un rótulo que se sale de su columna en el PDF de verdad.
 */
let measure: MeasureText;

beforeAll(async () => {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  measure = (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size);
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
  days: 30,
  capture: { ...emptyCapture(), deductions: { ...emptyCapture().deductions, salaryAdvance: 200 } },
};

/** Todo capturado: el comprobante MÁS LARGO posible, sus 26 filas. Es el caso que decide si la
 *  hoja da de sí, porque una ficha real imprime cinco. */
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

function documentFor(overrides: Partial<PayrollEmployeeLine> = {}): PayslipDocument {
  const line = { ...LINE, ...overrides };
  const capture = line.capture ?? emptyCapture();
  return buildPayslipDocument({
    line,
    computed: computeEmployeePayroll(toEngineInput(line), DEFAULT_PAYROLL_PARAMETERS),
    capture,
    year: 2026,
    monthIndex: 2,
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    position: 6,
  });
}

describe("el comprobante cabe en la hoja", () => {
  it("ninguna caja se sale del ancho útil", () => {
    const { boxes } = layoutPayslip(documentFor(FULL), measure);
    for (const box of boxes) {
      const width = measure(box.text, box.size, box.bold);
      const left = box.align === "right" ? box.x - width : box.x;
      expect(left, box.text).toBeGreaterThanOrEqual(PAYSLIP_COLUMNS.pageLeft - 0.5);
      expect(left + width, box.text).toBeLessThanOrEqual(PAYSLIP_COLUMNS.pageRight + 0.5);
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
    // Omitir las filas sin importe solo puede ACORTAR la hoja, nunca alargarla: el caso que decide
    // si cabe es el de arriba, con las 26.
    const short = layoutPayslip(documentFor(), measure);
    const long = layoutPayslip(documentFor(FULL), measure);
    expect(short.overflow).toBe(false);
    expect(short.boxes.length).toBeLessThan(long.boxes.length);
  });
});

describe("las columnas se respetan", () => {
  it("el rótulo más largo no invade la columna de valores", () => {
    // 39 caracteres, el peor caso del catálogo. Su fila no usa `Cantidad`, así que puede correr
    // hasta el inicio de `Valores` — que es exactamente el desbordamiento que hace el Excel.
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
    // `US$-1,171,420.00` es el peor caso realista: un líquido negativo de siete cifras.
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
    // Verde oliva para ingresos y celeste para costos: los rellenos que el contador ya usa en su
    // hoja y que la tabla de Datos de PyG pinta en la raíz 4 y la 5. Un verde quiere decir
    // «ingresos» en las tres superficies.
    const { fills } = layoutPayslip(documentFor(), measure);
    const colors = fills.map((f) => f.color);
    expect(colors).toContain(PAYSLIP_COLORS.income);
    expect(colors).toContain(PAYSLIP_COLORS.cost);
  });

  it("el líquido a recibir es la ÚNICA banda oscura", () => {
    // Es el importe que el empleado declara haber recibido al firmar: no puede confundirse con los
    // otros dos totales, y una segunda banda oscura le quitaría justamente eso.
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
    // 26 filas: 13 impares en cada bloque contando desde cero → 6 + 6. Con menos filas son menos,
    // y siguen alternando desde la primera de cada bloque.
    const { fills } = layoutPayslip(documentFor(FULL), measure);
    expect(fills.filter((f) => f.color === PAYSLIP_COLORS.zebra)).toHaveLength(12);
    // SORIA imprime 3 ingresos y 2 egresos: 1 + 1.
    const real = layoutPayslip(documentFor(), measure);
    expect(real.fills.filter((f) => f.color === PAYSLIP_COLORS.zebra)).toHaveLength(2);
  });

  it("todo importe impreso va en tinta plena, porque ya no hay rayas con las que competir", () => {
    const { boxes } = layoutPayslip(documentFor(), measure);
    expect(boxes.find((b) => b.text === "$487.21")?.color).toBe(PAYSLIP_COLORS.ink);
    expect(boxes.some((b) => b.text === "-")).toBe(false);
  });

  it("la cabecera `Cantidad` solo se escribe si alguna fila la usa", () => {
    // Rotular una columna vacía promete un dato que no está en la hoja.
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

  it("sin logo el comprobante queda EXACTAMENTE como estaba", () => {
    const { images, boxes, fills, rules } = layoutPayslip(documentFor(), measure);
    expect(images).toEqual([]);
    // La regresión que importa: el encabezado no se movió ni un punto por existir esta función.
    const company = boxes[0];
    expect(company?.x).toBe(PAYSLIP_COLUMNS.pageLeft);
    expect(fills.length).toBeGreaterThan(0);
    expect(rules.length).toBeGreaterThan(0);
  });

  it("con logo, el nombre de la empresa le cede el sitio y ninguno pisa al otro", () => {
    const { images, boxes } = layoutPayslip(withLogo(640, 160), measure);
    expect(images).toHaveLength(1);

    const mark = images[0]!;
    const company = boxes[0]!;
    expect(mark.x).toBe(PAYSLIP_COLUMNS.pageLeft);
    // El nombre empieza DESPUÉS de donde acaba el logo: es lo que evita que se solapen.
    expect(company.x).toBeGreaterThanOrEqual(mark.x + mark.width);
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

      // Y no invade el título de la derecha, que es la otra mitad del encabezado.
      const title = boxes.find((box) => box.text === "ROL DE PAGOS");
      expect(mark.x + mark.width).toBeLessThan(title!.x);
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
    // La primera regla es la raya que cierra el encabezado.
    expect(mark.y + mark.height).toBeLessThanOrEqual(rules[0]!.y);
  });
});
