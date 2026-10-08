import { AlertTriangle, FileJson } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ExcelFileIcon } from "./excel-file-icon";

export interface FileUploadCardProps {
  kind: "excel" | "json";
  fileName: string;
  originalFileName?: string;
  notice?: string;
  actionSlot?: ReactNode;
  children: ReactNode;
}

/** The selected file's identity, shared by import and restore previews. */
export function FileUploadCard({
  kind,
  fileName,
  originalFileName,
  notice,
  actionSlot,
  children,
}: FileUploadCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[13px] border px-4 py-3",
        kind === "excel" ? "border-excel/25 bg-excel/10" : "border-json/25 bg-json/10",
      )}
    >
      {kind === "excel" ? (
        <ExcelFileIcon className="mt-0.5" />
      ) : (
        <FileJson size={36} strokeWidth={1.5} className="mt-0.5 shrink-0 text-json" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-[12.5px]">
        <p title={originalFileName} className="font-semibold break-words text-ink">
          {fileName}
        </p>
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
