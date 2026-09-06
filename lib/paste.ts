/**
 * **What a block copied out of Excel means**, and the app's ONE reading of a clipboard.
 *
 * It started in `lib/revenue/` and moved here the day a second capture needed it: two clipboard
 * parsers would be two answers to «qué es un bloque pegado», which is exactly what a shared `lib/`
 * exists to prevent — `lib/format.ts`'s same rule for «qué es un monto».
 *
 * The gesture it serves is the one the accountant already has in their hands: select a column of
 * twelve figures in their own workbook, copy, click a cell in the drawer and paste. What arrives on
 * the clipboard is `text/plain` — rows separated by newlines, cells by TABS — and turning that into
 * amounts is a pure function, which is why it lives here and not in the grid: it is the part worth
 * testing, and the grid stays mount-only.
 *
 * **Every cell resolves to one of three things, and the third is the one that matters.**
 *
 * - a number → write it;
 * - EMPTY (`""`) → clear that cell to `null`, because an empty cell in the source is «no se registró»
 *   and pasting has to be able to say that too;
 * - anything that does NOT parse → `undefined`, meaning **leave the target untouched**.
 *
 * That last one is `NumericInput`'s own rule —«text that does not parse is NOT committed: reverting is
 * more honest than writing a zero nobody typed»— applied to a block instead of a cell. A stray word in
 * the middle of a column must not blank the month it lands on, and it must not stop the eleven good
 * figures around it from landing either.
 *
 * **Amounts go through `parseCurrency` and nothing else.** It already accepts what Excel puts on the
 * clipboard for this app's locale —`$1,234.56`, `1,234.56`, `-$980`— and a second number parser here
 * would be a second answer to «qué es un monto», which is exactly what `lib/format.ts` exists to
 * prevent.
 */
import { parseCurrency } from "@/lib/format";

/**
 * One pasted cell. `undefined` is not «empty» — it is «no pude leer esto», and the two are kept apart
 * because they do opposite things to the target: one clears it, the other leaves it alone.
 */
export type PastedCell = number | null | undefined;

/** Rows of cells, in the order they were copied. */
export type PastedGrid = PastedCell[][];

/** `\r\n`, `\r` and `\n`: the three a clipboard can carry depending on where it was copied from. */
const ROW_SEPARATOR = /\r\n|\r|\n/;

function readCell(raw: string): PastedCell {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  // `parseCurrency` returns `null` for text it does not recognise; here that is `undefined`, because
  // `null` already means «the source cell was empty».
  return parseCurrency(trimmed) ?? undefined;
}

/** Every cell blank — a row that says «estos meses van vacíos», or Excel's trailing newline. */
function isAllBlank(row: PastedCell[]): boolean {
  return row.every((cell) => cell === null);
}

/** Nothing in the row parsed as an amount — a header, or a row of prose. */
function isAllUnreadable(row: PastedCell[]): boolean {
  return row.every((cell) => cell === undefined);
}

/**
 * The clipboard's text as a grid of amounts.
 *
 * **A leading row where nothing parses is dropped as a HEADER.** Selecting a column in Excel together
 * with its title is the most natural way to copy one, and without this the twelve figures would land a
 * month late — enero would take «Ventas», febrero enero's figure, and diciembre would fall off the
 * end. Only the FIRST row is treated this way: an unreadable row further down is a gap in the data and
 * drops through as `undefined`s, which leave their months untouched rather than blanking them.
 *
 * **Trailing BLANK rows are dropped** —a copied range ends with a newline, so the last row is empty—
 * but a blank row in the MIDDLE is kept, because there it means «este mes va vacío» and pasting has to
 * be able to say that. A trailing row that failed to PARSE is never dropped: it is something the user
 * can see in their own selection, and swallowing it would hide the mistake instead of showing it.
 */
export function parsePastedGrid(text: string): PastedGrid {
  const rows = text.split(ROW_SEPARATOR).map((line) => line.split("\t").map(readCell));

  while (rows.length > 0 && isAllBlank(rows[rows.length - 1])) {
    rows.pop();
  }

  if (rows.length > 1 && isAllUnreadable(rows[0])) {
    rows.shift();
  }

  return rows;
}
