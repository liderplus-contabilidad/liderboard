"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { MICROPLUS_SYSTEM } from "@/lib/profit-loss/upload/systems";
import { usePygData } from "../pyg-data-provider";

/**
 * El cruce desde «Composición de los ingresos» hacia «Ventas por servicio»: el reparto contable del
 * ingreso y el reparto de lo FACTURADO son las dos lecturas de la misma pregunta, y la segunda no
 * cabe en el plan de cuentas —el estado parte el ingreso en dos cuentas y el reporte de facturación
 * lo parte en cinco servicios con sus pagadores—.
 *
 * **Va en la CABECERA de la tarjeta y con la forma de sus vecinos** —la píldora de «Ver como
 * tabla»—, no en el pie. Vivió abajo, con la advertencia de que lo facturado no cuadra con estas
 * cuentas escrita bajo el enlace, y ahí las dos líneas quedaban pegadas a la nota de «Fuera del
 * reparto» con la misma tinta y el mismo cuerpo: tres renglones grises al fondo de la tarjeta que
 * se leían como una sola nota al pie, donde el enlace no parecía pulsable y la advertencia no
 * parecía suya. Arriba es un control, que es lo que es.
 *
 * Esa mudanza se lleva la advertencia, porque una píldora no sostiene una frase: la declara la
 * pantalla de DESTINO, en la línea de su propio pie, que es donde el lector tiene por fin las dos
 * cifras delante y donde el aviso hace falta. Aquí queda de `title`, de apoyo y nunca como único
 * aviso —el rótulo ya dice a dónde lleva—. Ninguna cifra de ventas cruza a esta pantalla: lo único
 * que la atraviesa es el enlace.
 *
 * **Y no es `brand`**: el fucsia de `--color-crosslink` está para decir que este control SALE de la
 * tarjeta, mientras que `brand` es la acción primaria dentro de la pantalla. El rótulo repite
 * verbatim el del sidebar para que el lector reconozca dónde aterriza.
 *
 * **Solo con MicroPlus**, que es el sistema que emite ese reporte: `sourceSystemId` es el id de la
 * estrategia que cargó el workspace ABIERTO, y vale `null` en el Consolidado entre clientes, así
 * que ahí esto se rinde solo, sin un caso propio. NO mira si ya hay meses cargados — sin ellos la
 * pantalla de destino dice qué falta y trae su propio botón de carga, que es más de lo que este
 * enlace podría explicar.
 *
 * Vive en `components/profit-loss/sales/` y no en `charts/` porque lo que sabe es del subitem de
 * ventas; `GraficosView` solo lo coloca. Se monta por el `headerSlot` de la tarjeta y no viaja en
 * su `ChartCardSpec`: el informe imprimible lee esa misma lista, y un enlace en papel es un botón
 * que nadie puede pulsar.
 */
export function SalesCrossLink() {
  const { sourceSystemId } = usePygData();

  if (sourceSystemId !== MICROPLUS_SYSTEM) {
    return null;
  }

  return (
    <Link
      href="/profit-loss/sales"
      title="Lo facturado, repartido por servicio y por pagador. Es otro reporte y no cuadra con estas cuentas."
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-crosslink/25 bg-crosslink-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-crosslink transition-colors hover:border-crosslink/50 hover:text-crosslink-hover"
    >
      <ShoppingBag size={13} />
      Ventas por servicio
    </Link>
  );
}
