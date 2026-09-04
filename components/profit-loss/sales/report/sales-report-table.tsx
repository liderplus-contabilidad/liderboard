import { ReportTable } from "@/components/ui/report-table";

/**
 * «Ventas por servicio»' printed table.
 *
 * The shape moved to `components/ui/report-table.tsx` when a THIRD report needed it —the note this
 * file used to carry said that was the moment— and what is left here is the name its sections already
 * import. Kept as an alias rather than rewritten at every call site: the sections read better naming
 * their own module's table, and there is nothing left to diverge.
 */
export const SalesReportTable = ReportTable;
