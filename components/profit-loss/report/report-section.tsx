import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ReportSection as ReportSectionSpec } from "@/lib/profit-loss/report/types";

/**
 * One section of the report: its heading and, if it declared one, its page break.
 * `print-section`, `print-page-break` and `print-keep` are declared once in `globals.css`, so no
 * component writes a print rule of its own.
 *
 * WHICH sections open a page is not decided here — it arrives in `section.breakBefore`, next to
 * the decision of which sections exist at all. This component only mounts it.
 *
 * There is no orientation to choose: the whole report is A4 vertical — see the `@page` comment.
 */
export function ReportSection({
  section,
  children,
}: {
  section: ReportSectionSpec;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("print-section flex flex-col gap-4", section.breakBefore && "print-page-break")}
    >
      <header className="border-b border-border pb-2.5">
        <h2 className="text-[17px] font-semibold text-ink">{section.title}</h2>
        <p className="mt-0.5 text-[12px] text-muted">{section.subtitle}</p>
      </header>
      {children}
    </section>
  );
}
