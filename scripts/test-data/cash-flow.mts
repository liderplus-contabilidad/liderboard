/**
 * The Cuentas por Pagar set: what one hotel empresa receives in a month, in the three shapes the
 * module loads — Contífico's «Cartera por Pagar (Detallado)» at TWO cut dates (the second is what
 * lets a screenshot or a test show a reload settling what stopped coming), the check register's
 * book (`CHEQUES INICIO`) and the `CARGAS CASH` sheet — under `cuentas-por-pagar/`.
 *
 * Every name is invented (the real carteras hold real suppliers and are not in the repo), and
 * every figure comes from the shared PRNG seeded with the document itself, so the set regenerates
 * byte for byte. The center labels the cartera writes («CUMBRE ALTA» · «CUMBRE CENTRO») are the
 * ones the cash sheet's columns use, which is what lets the upload propose them once and the
 * matrix resolve them afterwards; the register's banks (PRODUBANCO · PICHINCHA, plus a CAJA the
 * upload will NOT propose) are what «Configurar» ends up holding.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";
import { excelSerial, rand, randRange, round2 } from "./prng.mts";

type Cell = string | number | null;

export const CASH_FLOW_COMPANY = "HOTELERA CUMBRE S.A.";
const CENTERS = ["CUMBRE ALTA", "CUMBRE CENTRO"] as const;
/** The two cuts, as Contífico prints them: the second one is fifteen days later. */
const CUTS = [
  { label: "15/09/2026", slug: "2026-09-15" },
  { label: "30/09/2026", slug: "2026-09-30" },
] as const;

interface Supplier {
  name: string;
  /** Contífico's Tipo Documento; the manual obligations are typed in the app, not here. */
  docType: "FAC" | "CVE" | "NVE" | "DNA";
  concept: string;
  min: number;
  max: number;
  /** How many documents the supplier carries at the first cut. */
  docs: number;
  center: (typeof CENTERS)[number] | "";
}

const SUPPLIERS: Supplier[] = [
  {
    name: "INMOBILIARIA PARAMO S.A.",
    docType: "FAC",
    concept: "ARRIENDO DE MES DE",
    min: 4200,
    max: 4200,
    docs: 3,
    center: "CUMBRE ALTA",
  },
  {
    name: "DISTRIBUIDORA ANDINA DE ALIMENTOS S.A.",
    docType: "FAC",
    concept: "VIVERES Y ABARROTES",
    min: 380,
    max: 1900,
    docs: 4,
    center: "CUMBRE CENTRO",
  },
  {
    name: "LAVANDERIA EL VAPOR CIA. LTDA.",
    docType: "FAC",
    concept: "SERVICIO DE LAVANDERIA",
    min: 240,
    max: 720,
    docs: 2,
    center: "CUMBRE ALTA",
  },
  {
    name: "SEGUROS CONDOR C.A.",
    docType: "FAC",
    concept: "POLIZA MULTIRIESGO",
    min: 1800,
    max: 2600,
    docs: 1,
    center: "",
  },
  {
    name: "ENERGIA DEL VALLE EP",
    docType: "FAC",
    concept: "CONSUMO ELECTRICO",
    min: 900,
    max: 1600,
    docs: 2,
    center: "CUMBRE CENTRO",
  },
  {
    name: "TELECOM SIERRA S.A.",
    docType: "FAC",
    concept: "INTERNET Y TELEFONIA",
    min: 160,
    max: 320,
    docs: 2,
    center: "CUMBRE ALTA",
  },
  {
    name: "PROVEEDORA HOTELERA SUMAK CIA. LTDA.",
    docType: "FAC",
    concept: "AMENITIES Y BLANCOS",
    min: 500,
    max: 2400,
    docs: 2,
    center: "CUMBRE ALTA",
  },
  {
    name: "ROJAS PAREDES MARCO ANTONIO",
    docType: "NVE",
    concept: "MANTENIMIENTO DE CALDEROS",
    min: 200,
    max: 650,
    docs: 2,
    center: "CUMBRE CENTRO",
  },
  {
    name: "AGENCIA DIGITAL QUINDE",
    docType: "CVE",
    concept: "PAUTA DIGITAL DE MES DE",
    min: 350,
    max: 900,
    docs: 2,
    center: "",
  },
  {
    name: "RESERVAS EN LINEA BV",
    docType: "CVE",
    concept: "COMISIONES DE RESERVAS DE MES DE",
    min: 700,
    max: 2900,
    docs: 2,
    center: "CUMBRE ALTA",
  },
  {
    name: "GAS INDUSTRIAL DEL SUR S.A.",
    docType: "FAC",
    concept: "GLP INDUSTRIAL",
    min: 300,
    max: 800,
    docs: 2,
    center: "CUMBRE CENTRO",
  },
  {
    name: "PANIFICADORA LA ESPIGA",
    docType: "NVE",
    concept: "PAN Y PASTELERIA",
    min: 90,
    max: 260,
    docs: 3,
    center: "CUMBRE CENTRO",
  },
  {
    name: "TRANSPORTES CUMBRE EXPRESS",
    docType: "DNA",
    concept: "MOVILIZACION HUESPEDES",
    min: 40,
    max: 180,
    docs: 1,
    center: "",
  },
  {
    name: "VILLALBA CONSULTORES CIA. LTDA.",
    docType: "FAC",
    concept: "ASESORIA TRIBUTARIA",
    min: 450,
    max: 450,
    docs: 1,
    center: "",
  },
];

const MONTHS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

interface Doc {
  supplier: Supplier;
  number: string;
  /** Day offset from the first cut: negative = issued before it. */
  issuedOffset: number;
  termDays: number;
  amount: number;
  payments: number;
}

function dmy(iso: Date): string {
  return `${String(iso.getUTCDate()).padStart(2, "0")}/${String(iso.getUTCMonth() + 1).padStart(2, "0")}/${iso.getUTCFullYear()}`;
}

function shift(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

const FIRST_CUT = new Date(Date.UTC(2026, 8, 15));

/** The documents of the FIRST cut: each supplier's `docs`, spread over the last five months. */
function documentsOf(): Doc[] {
  const docs: Doc[] = [];
  SUPPLIERS.forEach((supplier, supplierIndex) => {
    for (let n = 0; n < supplier.docs; n += 1) {
      const seed = `cxp|${supplier.name}|${n}`;
      // A monthly concept (arriendo, pauta, comisiones) issues ONE document per month, going back
      // from the cut; the rest fall anywhere in the last five months.
      const monthly = supplier.concept.endsWith(" DE");
      const issuedOffset = monthly
        ? -(n * 30 + Math.floor(randRange(`${seed}|issued`, 5, 25)))
        : -Math.floor(randRange(`${seed}|issued`, 2, 150));
      const termDays = [0, 15, 30, 30, 45, 60][Math.floor(rand(`${seed}|term`) * 6)];
      const amount = round2(randRange(`${seed}|amount`, supplier.min, supplier.max));
      // A third of the older documents carry a partial payment, as the real carteras do.
      const partial = issuedOffset < -60 && rand(`${seed}|paid`) < 0.35;
      const payments = partial ? round2(amount * randRange(`${seed}|ratio`, 0.2, 0.6)) : 0;
      docs.push({
        supplier,
        number: `001-00${1 + (supplierIndex % 2)}-${String(4000 + supplierIndex * 37 + n * 3).padStart(9, "0")}`,
        issuedOffset,
        termDays,
        amount,
        payments,
      });
    }
  });
  return docs;
}

function conceptOf(doc: Doc): string {
  const issued = shift(FIRST_CUT, doc.issuedOffset);
  const concept = doc.supplier.concept.endsWith(" DE")
    ? `${doc.supplier.concept} ${MONTHS[issued.getUTCMonth()]} ${issued.getUTCFullYear()}`
    : doc.supplier.concept;
  return `${doc.supplier.name} ${doc.supplier.docType} ${doc.number} ${concept}`;
}

const BUCKET_COLUMNS = ["Por vencer", "30 días", "60 días", "90 días", "120 días", "> 120 días"];

/** The bucket Contífico would print at `cut` — written so the file looks real; the app discards it. */
function bucketAt(dueOn: Date, cut: Date): number {
  const late = Math.floor((cut.getTime() - dueOn.getTime()) / 86_400_000);
  if (late < 0) {
    return 0;
  }
  return Math.min(5, 1 + Math.floor(late / 30));
}

function carteraRows(docs: Doc[], cut: Date, cutLabel: string): Cell[][] {
  const rows: Cell[][] = [
    [CASH_FLOW_COMPANY],
    ["Cartera por Pagar (Detallado)"],
    [`Fecha de Corte: ${cutLabel}`],
    [],
    [
      "Proveedor",
      "Razón Social",
      "Tipo Documento",
      "# Documento",
      "F. Emisión",
      "F. Vencimiento",
      "Vendedor",
      "Centro de Costo",
      "Categoría de Persona",
      ...BUCKET_COLUMNS,
      "Total",
      "Descripción",
      "Valor documento",
      "Retenciones",
      "Pagos",
    ],
  ];
  const bySupplier = new Map<string, Doc[]>();
  for (const doc of docs) {
    bySupplier.set(doc.supplier.name, [...(bySupplier.get(doc.supplier.name) ?? []), doc]);
  }
  for (const [name, group] of bySupplier) {
    const subtotal: Cell[] = [
      name,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const lines: Cell[][] = [];
    for (const doc of group) {
      const issued = shift(FIRST_CUT, doc.issuedOffset);
      const due = shift(issued, doc.termDays);
      const balance = round2(doc.amount - doc.payments);
      const buckets: Cell[] = [null, null, null, null, null, null];
      const bucket = bucketAt(due, cut);
      buckets[bucket] = balance;
      (subtotal[9 + bucket] as number) += balance;
      (subtotal[15] as number) += balance;
      lines.push([
        name,
        name,
        doc.supplier.docType,
        doc.number,
        dmy(issued),
        dmy(due),
        " ",
        doc.supplier.center,
        " ",
        ...buckets,
        balance,
        conceptOf(doc),
        doc.amount,
        0,
        doc.payments,
      ]);
    }
    for (let col = 9; col <= 15; col += 1) {
      subtotal[col] = (subtotal[col] as number) === 0 ? null : round2(subtotal[col] as number);
    }
    rows.push(subtotal, ...lines);
  }
  return rows;
}

/** The second cut: the settled documents stop coming, two new ones arrive, one partial grows. */
function secondCutDocuments(docs: Doc[]): Doc[] {
  const kept = docs.filter((doc, index) => !(index % 4 === 1 && doc.issuedOffset < -40));
  const arrivals: Doc[] = [
    {
      supplier: SUPPLIERS[0],
      number: "001-001-000004012",
      issuedOffset: 16,
      termDays: 0,
      amount: 4200,
      payments: 0,
    },
    {
      supplier: SUPPLIERS[1],
      number: "001-002-000004050",
      issuedOffset: 12,
      termDays: 30,
      amount: round2(randRange("cxp|arrival|2", 380, 1900)),
      payments: 0,
    },
  ];
  return [
    ...kept.map((doc) =>
      doc.payments > 0 ? { ...doc, payments: round2(doc.payments + doc.amount * 0.1) } : doc,
    ),
    ...arrivals,
  ];
}

// ── The check register ───────────────────────────────────────────────────────

const BANKS = ["PRODUBANCO", "PICHINCHA", "PRODUBANCO", "PICHINCHA", "CAJA"] as const;

function checksRows(): Cell[][] {
  const rows: Cell[][] = [
    [CASH_FLOW_COMPANY],
    ["CONTROL DE CHEQUES - PAGO A PROVEEDORES"],
    [],
    [
      "N° EGRESO",
      "BANCO",
      "NOMBRE",
      "CHEQUE",
      "VALOR",
      "FECHA DE EMISION",
      "REALIZADO",
      "FIRMADO",
      "ENTREGADO",
      "LUGAR",
      "DEPOSITADO",
      "ESTADO",
      "FECHA DE COBRO",
      "CORREO",
    ],
  ];
  const cutSerial = excelSerial(2026, 8, 15);
  for (let n = 0; n < 34; n += 1) {
    const seed = `cheque|${n}`;
    const bank = BANKS[Math.floor(rand(`${seed}|bank`) * BANKS.length)];
    const supplier = SUPPLIERS[Math.floor(rand(`${seed}|payee`) * SUPPLIERS.length)];
    // Issued over the eight months before the cut; the last few AFTER it, still in the checkbook.
    const issued = cutSerial - 240 + Math.floor((n / 34) * 250);
    const amount = round2(randRange(`${seed}|amount`, supplier.min, supplier.max));
    const number = bank === "CAJA" ? null : (bank === "PRODUBANCO" ? 61000 : 3400) + n;
    const voided = n === 9;
    const age = cutSerial - issued;
    // Old ones came back; the recent ones sit at the step the days since emission suggest.
    const step: "made" | "signed" | "delivered" | "cashed" =
      age > 45 ? "cashed" : age > 12 ? "delivered" : age > 5 ? "signed" : "made";
    const cashedOn =
      step === "cashed" ? issued + 3 + Math.floor(rand(`${seed}|cashed`) * 20) : null;
    rows.push([
      5200 + n,
      bank,
      voided ? "ANULADO" : supplier.name,
      number,
      amount,
      issued,
      "X",
      step === "made" ? null : "X",
      step === "signed" || step === "made" ? null : "X",
      step === "delivered" || step === "cashed" ? "ARCHIVO" : null,
      step === "cashed" ? "X" : null,
      voided
        ? "ANULADA"
        : step === "cashed"
          ? "COBRADO"
          : step === "delivered"
            ? "ENTREGADO"
            : null,
      cashedOn,
      null,
    ]);
  }
  // The book ends with pre-numbered vouchers that carry nothing yet.
  rows.push([5234], [5235], [5236]);
  return rows;
}

// ── The CARGAS CASH sheet ────────────────────────────────────────────────────

function cashRows(): Cell[][] {
  const header: Cell[] = [
    "FECHA",
    "DETALLE",
    ...CENTERS,
    `${CENTERS[0]}-${CENTERS[1]}`,
    "OBSERVACION",
  ];
  const day = (d: number) => excelSerial(2026, 8, d);
  return [
    ["CARGAS CASH PENDIENTE DE APROBACION"],
    ["MOVIMIENTO INICIAL"],
    header,
    [day(1), "SALDO EN CAJA AL INICIO", 850, 420, null, "ARQUEO DEL 01/09"],
    [day(3), "PRESTAMO ALTA A CENTRO", null, null, 600, "PARA PAGO DE PROVEEDORES"],
    [],
    ["TOTAL", null, 850, 420, 600],
    [],
    ["VARIOS"],
    header,
    [day(5), "BONO PERSONAL DE COCINA", null, 300, null, "ACORDADO EN AGOSTO"],
    [day(8), "SUELDO 08-2026 J. GUAMAN", null, 512.4, null, "MESERO"],
    [day(10), "CAJA CHICA RECEPCION", 150, null, null, null],
    [],
    ["TOTAL", null, 150, 812.4, 0],
    [],
    ["PROVEEDORES"],
    [],
    header,
    [day(12), "PANIFICADORA LA ESPIGA", null, 214.3, null, null],
    [day(12), "TRANSPORTES CUMBRE EXPRESS", 96.5, null, null, null],
    ["TOTAL", null, 96.5, 214.3, 0],
  ];
}

// ── Writer ───────────────────────────────────────────────────────────────────

function writeSheet(rows: Cell[][], sheetName: string, file: string): void {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

/** Writes the four books under `<outDir>/cuentas-por-pagar/` and returns how many. */
export function writeCashFlowSet(outDir: string): number {
  const dir = join(outDir, "cuentas-por-pagar");
  const docs = documentsOf();
  writeSheet(
    carteraRows(docs, FIRST_CUT, CUTS[0].label),
    "Cartera por Pagar",
    join(dir, `cartera-contifico-${CUTS[0].slug}.xlsx`),
  );
  writeSheet(
    carteraRows(secondCutDocuments(docs), shift(FIRST_CUT, 15), CUTS[1].label),
    "Cartera por Pagar",
    join(dir, `cartera-contifico-${CUTS[1].slug}.xlsx`),
  );
  writeSheet(checksRows(), "PAGO A PROVEEDORES", join(dir, "control-de-cheques.xlsx"));
  writeSheet(cashRows(), "CARGAS CASH", join(dir, "cargas-cash.xlsx"));
  return 4;
}
