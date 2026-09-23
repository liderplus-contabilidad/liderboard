"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { PdfPreview } from "@/lib/cash-flow/check-print/download";

/** Preview and print the same PDF bytes, never a browser layout of the check. */
export function CheckPdfPreview({ pdf, onClose }: { pdf: PdfPreview; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const objectUrl = URL.createObjectURL(pdf.blob);
    setUrl(objectUrl);
    setReady(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pdf]);

  const print = () => {
    try {
      const viewer = frame.current?.contentWindow;
      if (!viewer) return;
      viewer.focus();
      viewer.print();
    } catch {
      setError("Usa el botón de impresión del visor PDF o abre el PDF en otra pestaña.");
    }
  };

  return (
    <Modal open fill title={pdf.filename} onClose={onClose}>
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" icon={<Printer size={13} />} disabled={!ready} onClick={print}>
            Imprimir
          </Button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-brand underline"
            >
              Abrir PDF en otra pestaña
            </a>
          )}
          <p className="text-[12px] text-muted">
            Imprime a «Tamaño real» (100 %), sin ajustar a página, con el papel del tamaño
            configurado para esta cuenta. El visor y la impresora pueden cambiar la escala:
            compruébala en el diálogo de impresión.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-negative">
            {error}
          </p>
        )}
        {url && (
          <iframe
            ref={frame}
            src={url}
            title="Vista previa del cheque en PDF"
            className="min-h-0 w-full flex-1 rounded border border-border"
            onLoad={() => setReady(true)}
          />
        )}
      </div>
    </Modal>
  );
}
