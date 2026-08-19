/**
 * IDA Y VUELTA: el archivo que esta app genera, leído por el importador que lee el del contador.
 *
 * Es el test que sostiene la promesa de la descarga —«prácticamente igual al que se sube»— y el
 * único sitio donde se pueden ver las dos cosas que solo existen ya escritas en el `.xlsx`: que la
 * fecha de ingreso no se desplace un día al pasar por el serial de Excel, y que el membrete del logo
 * no le esconda el período al lector.
 *
 * Pasa por exceljs de verdad y vuelve por SheetJS de verdad, sin mocks: lo que puede fallar aquí es
 * precisamente la frontera entre las dos librerías.
 */
import { describe, expect, it } from "vitest";
import type { EntityLogo } from "@/lib/logos";
import { emptyCapture } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS } from "../engine/parameters";
import type { ParsedPayrollEmployeeLine, PayrollExtraConcept } from "../types";
import { parseRolGeneral } from "../upload/rol-general";
import type { RolExportInput } from "./rol-grid";
import { buildRolWorkbook } from "./workbook";

/** Un PNG de 1×1 transparente. Lo único que importa de él es que exceljs lo pueda embeber. */
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

/** El perfil de empresa del archivo real del cliente: tres líneas bajo el nombre. */
const COMPANY = {
  legalName: "DELICMAR S.A.S.",
  taxId: "1891234567001",
  province: "TUNGURAHUA",
  canton: "AMBATO",
  parish: "AMBATO",
  address: "LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
  phones: "0991045439 - 0958780660",
};

function input(
  lines: readonly ParsedPayrollEmployeeLine[],
  extraConcepts: readonly PayrollExtraConcept[] = [],
  company?: typeof COMPANY,
): RolExportInput {
  return {
    clientName: "HOTEL BOUTIQUE CULTURA MANOR",
    ...(company ? { company } : {}),
    year: 2026,
    monthIndex: 2,
    lines,
    parameters: DEFAULT_PAYROLL_PARAMETERS,
    extraConcepts,
  };
}

async function roundTrip(
  lines: readonly ParsedPayrollEmployeeLine[],
  logo?: EntityLogo,
  extraConcepts: readonly PayrollExtraConcept[] = [],
  company?: typeof COMPANY,
) {
  const buffer = await buildRolWorkbook(input(lines, extraConcepts, company), logo ?? null);
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
    // exceljs convierte un `Date` restándole el desfase horario local: con medianoche UTC, en
    // Ecuador (UTC−5) el serial cae en el día anterior y la fecha vuelve cambiada.
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
    // `M` recortado a 0 con horas trabajadas: la app lo escribe y el lector lo vuelve a deducir.
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

  it("los conceptos extra NO vuelven — la limitación declarada", async () => {
    // El lector todavía no busca `OTROS INGRESOS`, así que su importe se pierde y el total baja.
    // Está escrito aquí para que deje de ser cierto el día que alguien le enseñe esa columna.
    const line = employee("ALFA", {
      capture: { ...emptyCapture(), extraAmounts: { mov: 50 } },
    });
    const parsed = await roundTrip([line], undefined, [
      { id: "mov", label: "MOVILIZACION", kind: "aportable" },
    ]);
    expect(parsed.lines[0].capture?.extraAmounts).toBeUndefined();
  });
});

describe("con el membrete completo", () => {
  const LINES = [employee("MORALES MENA SILVIA JIMENA"), employee("ALFA", { area: "COCINA" })];

  // El caso que junta las dos cosas que mueven el preámbulo: la banda del logo por encima y las
  // líneas del membrete por debajo del nombre. Es lo que baja el usuario de verdad.
  it("recupera el período, la empresa y la nómina entera", async () => {
    const parsed = await roundTrip(LINES, LOGO, [], COMPANY);
    expect(parsed.company).toBe("HOTEL BOUTIQUE CULTURA MANOR");
    expect(parsed.year).toBe(2026);
    expect(parsed.monthIndex).toBe(2);
    expect(parsed.lines.map((line) => line.name)).toEqual(["MORALES MENA SILVIA JIMENA", "ALFA"]);
    expect(parsed.warnings).toEqual([]);
  });

  it("lee las mismas fichas y capturas que sin membrete", async () => {
    const conMembrete = await roundTrip(LINES, LOGO, [], COMPANY);
    const sinMembrete = await roundTrip(LINES);
    expect(conMembrete.lines).toEqual(sinMembrete.lines);
  });

  // Ninguna línea del membrete puede colarse como un área: las áreas viven bajo la cabecera y esto
  // está por encima.
  it("ninguna línea del membrete se lee como un área ni como un empleado", async () => {
    const parsed = await roundTrip(LINES, LOGO, [], COMPANY);
    expect(parsed.lines.map((line) => line.area)).toEqual(["HOSPEDAJE", "COCINA"]);
  });
});
