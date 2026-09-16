/**
 * Which reader a cartera workbook gets — first match wins, like PyG's `upload/registry.ts`. Every
 * sheet is tried, because the `FORMATO IDEAL` keeps the Contífico paste on its second and third
 * sheets, and reading only the first would reject a perfectly readable book.
 *
 * `readCartera` RETURNS its verdict instead of throwing: the dialog shows a rejection as a message
 * next to the file, not as an exception, and the message names what IS accepted.
 */
import { readGrid, readWorkbook } from "@/lib/excel/workbook";
import type { ParsedCartera } from "../types";
import { matchesContifico, parseContifico } from "./contifico";
import { matchesDingoo, parseDingoo } from "./dingoo";
import type { Grid } from "./grid";

export interface CarteraStrategy {
  id: "contifico" | "dingoo";
  label: string;
  matches: (grid: Grid) => boolean;
  parse: (grid: Grid) => ParsedCartera;
}

export const CARTERA_STRATEGIES: readonly CarteraStrategy[] = [
  {
    id: "contifico",
    label: "Contífico · Cartera por pagar",
    matches: matchesContifico,
    parse: parseContifico,
  },
  {
    id: "dingoo",
    label: "Dingoo · Reporte de cuentas por pagar",
    matches: matchesDingoo,
    parse: parseDingoo,
  },
];

export type CarteraReadResult =
  | { ok: true; strategy: CarteraStrategy; cartera: ParsedCartera; sheetName: string }
  | { ok: false; message: string };

export const REJECTION =
  "Este archivo no es una cartera por pagar reconocida. Se aceptan la «Cartera por Pagar (Detallado)» de Contífico —también pegada en el FORMATO IDEAL— y el «Reporte · Cuentas por pagar» de Dingoo.";

export function readCartera(data: ArrayBuffer): CarteraReadResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return {
      ok: false,
      message: "No se pudo leer el archivo. Verifica que sea un Excel (.xls o .xlsx) válido.",
    };
  }
  for (const sheetName of workbook.SheetNames) {
    const grid = readGrid(workbook, sheetName);
    if (!grid) {
      continue;
    }
    for (const strategy of CARTERA_STRATEGIES) {
      if (strategy.matches(grid)) {
        return { ok: true, strategy, cartera: strategy.parse(grid), sheetName };
      }
    }
  }
  return { ok: false, message: REJECTION };
}
