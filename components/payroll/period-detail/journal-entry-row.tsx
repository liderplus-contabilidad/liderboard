import { memo } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import type { JournalLine } from "@/lib/payroll/journal";

interface JournalEntryRowProps {
  line: JournalLine;
}

/**
 * A row's amount: with `$` and cents, the same currency as the rest of the app — the accountant
 * checks this table against their sheet and against the other screens, and two dialects of the dollar
 * read as two kinds of figure.
 *
 * `formatCurrencyOrDash` does NOT serve here: it paints zero as absence, and in the journal entry a
 * `0` says «that column did not move» while `null` says «it is not known» — the distinction that
 * holds up the «Ocultar ceros» switch, which hides the former and keeps the latter.
 */
function amount(value: number | null): string {
  return value === null ? "—" : formatCurrency(value, { cents: true });
}

/**
 * A row of the journal entry: code · account · debit · credit. The name is wrapped in a `<span>` of
 * its own (instead of passing weight/colour to `Cell` through `className`) because `Cell` already
 * ships `font-normal` — competing for the same property on the same `<td>` is at the mercy of the
 * order in which Tailwind emits the rules, and a child `<span>` does not have that problem.
 */
function JournalEntryRowComponent({ line }: JournalEntryRowProps) {
  const isHaber = line.side === "haber";
  const tone = line.amount === null ? "muted" : "default";

  return (
    <GridRow>
      <Cell>
        <span className="font-mono text-faint">{line.code ?? "—"}</span>
      </Cell>
      <Cell>
        <span className={cn("text-ink", isHaber ? "ml-6 font-normal" : "font-semibold")}>
          {line.name}
        </span>
      </Cell>
      <Cell numeric tone={tone} className="font-mono">
        {line.side === "debe" ? amount(line.amount) : null}
      </Cell>
      <Cell numeric tone={tone} className="font-mono">
        {line.side === "haber" ? amount(line.amount) : null}
      </Cell>
    </GridRow>
  );
}

// The whole entry can repaint on every «Ocultar ceros» toggle — memoized with a stable key
// (`line.id`), like `EmployeeRow`.
export const JournalEntryRow = memo(JournalEntryRowComponent);
