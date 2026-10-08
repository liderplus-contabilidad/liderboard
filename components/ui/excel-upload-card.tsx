import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { ExcelFileIcon } from "./excel-file-icon";

export function ExcelUploadCard({
  fileName,
  notice,
  actionSlot,
  children,
}: {
  fileName: string;
  notice?: string;
  actionSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[13px] border border-excel/25 bg-excel/10 px-4 py-3">
      <ExcelFileIcon className="mt-0.5" />
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p className="font-semibold break-words text-ink">{fileName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-soft">
          {children}
          {notice && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[11.5px] text-ink tabular-nums">
              <AlertTriangle size={13} className="text-warning" aria-hidden="true" />
              {notice}
            </span>
          )}
        </div>
      </div>
      {actionSlot}
    </div>
  );
}
