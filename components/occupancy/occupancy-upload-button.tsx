"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOccupancyData } from "./occupancy-data-provider";

/**
 * "Cargar Excel de ocupación", rendered in the module tab bar as in the design. Parse
 * failures are surfaced by the provider so the banner can sit above the grid, where the
 * user is looking, instead of next to the button.
 */
export function OccupancyUploadButton() {
  const { importWorkbooks } = useOccupancyData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    // pb matches <Semaforo/>: the tab bar aligns its right slot to the tab underline.
    <div className="pb-[11px]">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          // Cleared immediately so picking the same files twice fires change again.
          event.target.value = "";
          if (files.length === 0) {
            return;
          }
          setBusy(true);
          try {
            await importWorkbooks(files);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        variant="secondary"
        disabled={busy}
        icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Procesando…" : "Cargar Excel de ocupación"}
      </Button>
    </div>
  );
}
