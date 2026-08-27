/**
 * ROUND TRIP: the file this app generates, read by the importer that reads the accountant's.
 *
 * It is the test that holds up the download's promise —«practically the same as the one uploaded»—
 * and the only place where the two things that only exist once written into the `.xlsx` can be seen:
 * that the hire date does not shift by a day on going through Excel's serial, and that the logo's
 * letterhead does not hide the period from the reader.
 *
 * It goes through real exceljs and comes back through real SheetJS, with no mocks: what can fail here
 * is precisely the boundary between the two libraries.
 */
import { describe, expect, it } from "vitest";
import type { EntityLogo } from "@/lib/logos";
import { emptyCapture } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { ParsedPayrollEmployeeLine } from "../types";
import { parseRolGeneral } from "../upload/rol-general";
import type { RolExportInput } from "./rol-grid";
import { buildRolWorkbook } from "./workbook";

/** A transparent 1×1 PNG. The only thing that matters about it is that exceljs can embed it. */
const LOGO: EntityLogo = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  mime: "image/png",
  width: 120,
  height: 40,
};

function employee(
  name: string,
  overrides: Partial<ParsedPayrollEmployeeLine> = {},
): ParsedPayrollEmployeeLine {
  return {
    name,
    role: "CAMARERA DE PISOS",
    area: "HOSPEDAJE",
    baseSalary: 487.21,
    contractType: "CT",
    idCard: "1714097084",
    hireDate: "2025-10-07",
    sectorCode: "1608551004134",
    hasReserveFund: true,
    accumulatesReserveFund: false,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    capture: {
      ...emptyCapture(),
      overtimeHours50: 5.5,
      approvedOvertime: 0,
      allowances: 25,
      deductions: { ...emptyCapture().deductions, iessLoans: 64.25, salaryAdvance: 200 },
      paid: 457.69,
    },
    ...overrides,
  };
}

/** The client's real file company profile: three lines under the name. */
const COMPANY = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
};

/** The cost center declared when the client was created: its name composes `B`'s label and its logo
 *  heads on the left, pushing the client's to the right. */
const CENTER = { name: "Planta Ambato", logo: { ...LOGO, dataUrl: "data:image/png;base64,Q0M=" } };

function input(
  lines: readonly ParsedPayrollEmployeeLine[],
  company?: typeof COMPANY,
  costCenter?: typeof CENTER,
): RolExportInput {
  return {
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    ...(company ? { company } : {}),
    ...(costCenter ? { costCenter } : {}),
    year: 2026,
    monthIndex: 2,
    lines,
    parameters: DEFAULT_PAYROLL_PARAMETERS,
  };
}

async function roundTrip(
  lines: readonly ParsedPayrollEmployeeLine[],
  logo?: EntityLogo,
  company?: typeof COMPANY,
  costCenter?: typeof CENTER,
) {
  const buffer = await buildRolWorkbook(input(lines, company, costCenter), logo ?? null);
  return parseRolGeneral(buffer);
}

describe("el rol descargado vuelve a entrar", () => {
  it("recupera el período y la empresa", async () => {
    const parsed = await roundTrip([employee("MORALES MENA SILVIA JIMENA")]);
    expect(parsed.year).toBe(2026);
    expect(parsed.monthIndex).toBe(2);
    expect(parsed.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
  });

  it("no deja ningún aviso: el archivo trae todas las columnas que el lector busca", async () => {
    const parsed = await roundTrip([employee("MORALES MENA SILVIA JIMENA")]);
    expect(parsed.warnings).toEqual([]);
  });

  it("recupera la ficha entera de cada empleado", async () => {
    const line = employee("MORALES MENA SILVIA JIMENA");
    const parsed = await roundTrip([line]);
    expect(parsed.lines).toHaveLength(1);
    const back = parsed.lines[0];
    expect(back.name).toBe(line.name);
    expect(back.role).toBe(line.role);
    expect(back.area).toBe(line.area);
    expect(back.baseSalary).toBe(line.baseSalary);
    expect(back.days).toBe(line.days);
    expect(back.contractType).toBe(line.contractType);
    expect(back.idCard).toBe(line.idCard);
    expect(back.sectorCode).toBe(line.sectorCode);
    expect(back.hasReserveFund).toBe(line.hasReserveFund);
    expect(back.accumulatesReserveFund).toBe(line.accumulatesReserveFund);
  });

  it("la fecha de ingreso no se mueve un día al pasar por el serial de Excel", async () => {
    // exceljs converts a `Date` by subtracting the local time-zone offset: with UTC midnight, in
    // Ecuador (UTC−5) the serial falls on the previous day and the date comes back changed.
    const parsed = await roundTrip([employee("ALFA", { hireDate: "2026-03-01" })]);
    expect(parsed.lines[0].hireDate).toBe("2026-03-01");
  });

  it("recupera lo capturado del mes, recorte de horas extras incluido", async () => {
    const parsed = await roundTrip([employee("MORALES MENA SILVIA JIMENA")]);
    const capture = parsed.lines[0].capture!;
    expect(capture.overtimeHours50).toBe(5.5);
    expect(capture.allowances).toBe(25);
    expect(capture.deductions.iessLoans).toBe(64.25);
    expect(capture.deductions.salaryAdvance).toBe(200);
    expect(capture.paid).toBe(457.69);
    // `M` trimmed to 0 with hours worked: the app writes it and the reader deduces it again.
    expect(capture.approvedOvertime).toBe(0);
  });

  it("un empleado sin pago declarado vuelve SIN pago declarado, no en cero", async () => {
    const line = employee("ALFA", { capture: { ...emptyCapture(), paid: null } });
    const parsed = await roundTrip([line]);
    expect(parsed.lines[0].capture?.paid).toBeNull();
  });

  it("conserva las áreas y su orden", async () => {
    const parsed = await roundTrip([
      employee("ALFA", { area: "HOSPEDAJE" }),
      employee("BETA", { area: "COCINA" }),
      employee("GAMMA", { area: "COCINA" }),
    ]);
    expect(parsed.lines.map((line) => [line.name, line.area])).toEqual([
      ["ALFA", "HOSPEDAJE"],
      ["BETA", "COCINA"],
      ["GAMMA", "COCINA"],
    ]);
  });

  it("con membrete, el período sigue encontrándose", async () => {
    const parsed = await roundTrip([employee("ALFA")], LOGO);
    expect(parsed.year).toBe(2026);
    expect(parsed.monthIndex).toBe(2);
    expect(parsed.lines).toHaveLength(1);
  });

  it("las filas de bono NO vuelven — la limitación declarada", async () => {
    // The reader does not look for `OTROS INGRESOS` yet, so its amount is lost and the total drops.
    // It is written here so it stops being true the day someone teaches it that column.
    const line = employee("ALFA", {
      capture: {
        ...emptyCapture(),
        extras: [{ id: "mov", label: "MOVILIZACION", kind: "aportable", amount: 50 }],
      },
    });
    const parsed = await roundTrip([line]);
    expect(parsed.lines[0].capture?.extras ?? []).toEqual([]);
  });

  it("un RÓTULO PROPIO tampoco vuelve, pero su importe sí — la cabecera es la del libro", async () => {
    // The `GENERAL` sheet keeps `AH → OTROS` verbatim: a column has ONE header, and the letter is the
    // contract the accountant checks against. The name lives on screen and on paper.
    const line = employee("ALFA", {
      capture: {
        ...emptyCapture(),
        labels: { "E-11": "Uniformes" },
        deductions: { ...emptyCapture().deductions, otherDeductions: 36 },
      },
    });
    const parsed = await roundTrip([line]);
    expect(parsed.lines[0].capture?.deductions.otherDeductions).toBe(36);
    expect(parsed.lines[0].capture?.labels).toBeUndefined();
  });
});

describe("con el membrete completo", () => {
  const LINES = [employee("MORALES MENA SILVIA JIMENA"), employee("ALFA", { area: "COCINA" })];

  // The case that brings together the two things that move the preamble: the logo's band above and
  // the letterhead's lines below the name. It is what the user actually downloads.
  it("recupera el período, la empresa y la nómina entera", async () => {
    const parsed = await roundTrip(LINES, LOGO, COMPANY);
    expect(parsed.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
    expect(parsed.year).toBe(2026);
    expect(parsed.monthIndex).toBe(2);
    expect(parsed.lines.map((line) => line.name)).toEqual(["MORALES MENA SILVIA JIMENA", "ALFA"]);
    expect(parsed.warnings).toEqual([]);
  });

  it("lee las mismas fichas y capturas que sin membrete", async () => {
    const conMembrete = await roundTrip(LINES, LOGO, COMPANY);
    const sinMembrete = await roundTrip(LINES);
    expect(conMembrete.lines).toEqual(sinMembrete.lines);
  });

  // No line of the letterhead can slip in as an area: the areas live under the header and this is
  // above it.
  it("ninguna línea del membrete se lee como un área ni como un empleado", async () => {
    const parsed = await roundTrip(LINES, LOGO, COMPANY);
    expect(parsed.lines.map((line) => line.area)).toEqual(["HOSPEDAJE", "COCINA"]);
  });
});

/**
 * THE COST CENTER ON THE SHEET. What can be wrong is the round trip: `B`'s label is what the reader
 * takes for the company, and with TWO logos the preamble starts further down. None of this touches
 * the figures, and that is precisely what these tests assert.
 */
describe("con centro de costo", () => {
  const LINES = [employee("MORALES MENA SILVIA JIMENA"), employee("ALFA", { area: "COCINA" })];

  it("escribe el rótulo compuesto, el mismo que encabeza el comprobante en PDF", async () => {
    const parsed = await roundTrip(LINES, LOGO, COMPANY, CENTER);
    expect(parsed.company).toBe("HOTEL BOUTIQUE CULTURA MANOR · Planta Ambato");
  });

  it("el período y la nómina entera vuelven a entrar bajo los dos logos", async () => {
    const parsed = await roundTrip(LINES, LOGO, COMPANY, CENTER);
    expect(parsed.year).toBe(2026);
    expect(parsed.monthIndex).toBe(2);
    expect(parsed.lines.map((line) => line.name)).toEqual(["MORALES MENA SILVIA JIMENA", "ALFA"]);
    expect(parsed.warnings).toEqual([]);
  });

  it("lee las mismas fichas y capturas que sin centro: el papel cambia, las cifras no", async () => {
    const conCentro = await roundTrip(LINES, LOGO, COMPANY, CENTER);
    const sinCentro = await roundTrip(LINES, LOGO, COMPANY);
    expect(conCentro.lines).toEqual(sinCentro.lines);
  });
});
