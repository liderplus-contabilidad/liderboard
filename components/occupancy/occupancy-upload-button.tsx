"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OccupancyUploadModal } from "./occupancy-upload-modal";

/**
 * "Cargar Excel de ocupación", rendered in the module tab bar as in the design. It only opens
 * the staging modal: what each file declares — and why one of them fails — is shown there,
 * before anything is written.
 */
export function OccupancyUploadButton() {
  const [open, setOpen] = useState(false);

  return (
    // pb matches <Semaforo/>: the tab bar aligns its right slot to the tab underline.
    <div className="pb-[11px]">
      <Button variant="secondary" icon={<Upload size={15} />} onClick={() => setOpen(true)}>
        Cargar Excel de ocupación
      </Button>
      <OccupancyUploadModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
